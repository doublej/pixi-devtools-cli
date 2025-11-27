// Script to be injected into browser context via CDP
// Extracts debugging data from PixiJS applications

export const INJECT_SCRIPT = `
(function() {
  // Find PixiJS objects
  function findPixi() {
    const sources = [
      window.__PIXI_DEVTOOLS__,
      window.__PIXI_APP__,
      { stage: window.__PIXI_STAGE__, renderer: window.__PIXI_RENDERER__ }
    ];

    for (const source of sources) {
      if (source && (source.app || source.stage || source.renderer)) {
        return {
          app: source.app || window.__PIXI_APP__,
          stage: source.stage || source.app?.stage || window.__PIXI_STAGE__,
          renderer: source.renderer || source.app?.renderer || window.__PIXI_RENDERER__,
          pixi: source.pixi || window.PIXI || window.__PIXI__,
          version: source.version || window.PIXI?.VERSION || ''
        };
      }
    }
    return null;
  }

  // Get node type
  function getPixiType(container) {
    const checks = [
      ['BitmapText', c => 'renderPipeId' in c && c.renderPipeId === 'BitmapText'],
      ['HTMLText', c => 'renderPipeId' in c && c.renderPipeId === 'htmlText'],
      ['Text', c => 'renderPipeId' in c && c.renderPipeId === 'text'],
      ['Mesh', c => 'renderPipeId' in c && c.renderPipeId === 'mesh'],
      ['Graphics', c => 'renderPipeId' in c && c.renderPipeId === 'graphics'],
      ['AnimatedSprite', c => 'gotoAndPlay' in c && 'stop' in c && 'play' in c],
      ['NineSliceSprite', c => 'renderPipeId' in c && c.renderPipeId === 'nineSliceSprite'],
      ['TilingSprite', c => 'renderPipeId' in c && c.renderPipeId === 'tilingSprite'],
      ['Sprite', c => 'renderPipeId' in c && c.renderPipeId === 'sprite'],
      ['ParticleContainer', c => 'renderPipeId' in c && c.renderPipeId === 'particle'],
      ['Container', c => 'children' in c && 'parent' in c]
    ];

    for (const [type, check] of checks) {
      if (check(container)) return type;
    }
    return 'Unknown';
  }

  // Generate unique ID
  let uidCounter = 0;
  const uidMap = new WeakMap();
  function getUid(container) {
    if (uidMap.has(container)) return uidMap.get(container);
    const uid = 'node_' + (uidCounter++);
    uidMap.set(container, uid);
    return uid;
  }

  // Build scene graph
  function buildSceneGraph(container, depth = 0) {
    if (!container || container.__devtoolIgnore) return null;

    const type = getPixiType(container);
    const version = findPixi()?.version?.startsWith('8') ? 8 : 7;
    const name = version === 8 ? container.label : container.name;

    const node = {
      id: getUid(container),
      name: name || type,
      type: type,
      visible: container.visible,
      alpha: container.alpha,
      position: { x: container.x, y: container.y },
      scale: { x: container.scale?.x ?? 1, y: container.scale?.y ?? 1 },
      rotation: container.rotation || 0,
      pivot: { x: container.pivot?.x ?? 0, y: container.pivot?.y ?? 0 },
      anchor: container.anchor ? { x: container.anchor.x, y: container.anchor.y } : null,
      width: container.width,
      height: container.height,
      worldVisible: container.worldVisible,
      worldAlpha: container.worldAlpha,
      zIndex: container.zIndex || 0,
      sortableChildren: container.sortableChildren || false,
      interactive: container.interactive || false,
      depth: depth,
      children: []
    };

    // Add type-specific properties
    if (type === 'Sprite' || type === 'AnimatedSprite') {
      node.texture = container.texture?.label || container.texture?.source?.label || null;
      node.tint = container.tint;
      node.blendMode = container.blendMode;
    }
    if (type === 'Text' || type === 'BitmapText' || type === 'HTMLText') {
      node.text = container.text?.substring(0, 100);
    }
    if (type === 'Graphics') {
      node.fillStyle = container._fillStyle;
      node.lineStyle = container._lineStyle;
    }

    if (container.children && !container.__devtoolIgnoreChildren) {
      for (const child of container.children) {
        const childNode = buildSceneGraph(child, depth + 1);
        if (childNode) node.children.push(childNode);
      }
    }

    return node;
  }

  // Collect stats by traversing scene graph
  function collectStats(container, stats = {}) {
    if (!container) return stats;

    const type = getPixiType(container);
    const key = type.toLowerCase();
    stats[key] = (stats[key] || 0) + 1;
    stats.total = (stats.total || 0) + 1;

    if (container.effects) {
      stats.filters = (stats.filters || 0) + (Array.isArray(container.effects) ? container.effects.length : 1);
    }
    if (container.mask) {
      stats.masks = (stats.masks || 0) + 1;
    }

    if (container.children && !container.__devtoolIgnoreChildren) {
      for (const child of container.children) {
        collectStats(child, stats);
      }
    }
    return stats;
  }

  // Get rendering info
  function getRenderingInfo(renderer) {
    if (!renderer) return null;

    const canvas = renderer.canvas || renderer.view;
    const isWebGPU = renderer.type === 0b10;
    const type = isWebGPU ? 'webgpu' : (renderer.context?.webGLVersion === 1 ? 'webgl' : 'webgl2');

    return {
      type: type,
      width: canvas?.width,
      height: canvas?.height,
      resolution: renderer.resolution,
      background: renderer.background?.color?.toHex?.() || null,
      backgroundAlpha: renderer.background?.alpha,
      antialias: renderer.view?.antialias,
      clearBeforeRender: renderer.background?.clearBeforeRender,
      roundPixels: renderer.roundPixels
    };
  }

  // Get texture info
  function getTextureInfo(renderer) {
    if (!renderer?.texture?.managedTextures) return [];

    const textures = [];
    for (const texture of renderer.texture.managedTextures) {
      if (!texture.resource) continue;

      textures.push({
        label: texture.label || 'unnamed',
        width: texture.width,
        height: texture.height,
        pixelWidth: texture.pixelWidth,
        pixelHeight: texture.pixelHeight,
        format: texture.format,
        mipLevelCount: texture.mipLevelCount,
        autoGenerateMipmaps: texture.autoGenerateMipmaps,
        alphaMode: texture.alphaMode,
        antialias: texture.antialias,
        destroyed: texture.destroyed,
        isPowerOfTwo: texture.isPowerOfTwo,
        autoGarbageCollect: texture.autoGarbageCollect
      });
    }
    return textures;
  }

  // Get render instructions (PixiJS v8 only)
  function getRenderInstructions(renderer, stage) {
    if (!renderer || !stage?.renderGroup?.instructionSet) return null;

    const instructionSet = stage.renderGroup.instructionSet;
    const instructions = [];

    for (let i = 0; i < instructionSet.instructionSize; i++) {
      const inst = instructionSet.instructions[i];
      instructions.push({
        type: inst.renderPipeId || 'unknown',
        action: inst.action || 'unknown',
        blendMode: inst.blendMode,
        size: inst.size,
        start: inst.start
      });
    }

    return {
      count: instructionSet.instructionSize,
      instructions: instructions
    };
  }

  // Get FPS estimate
  let lastTime = performance.now();
  let frameCount = 0;
  let fps = 0;

  function measureFps() {
    const now = performance.now();
    frameCount++;
    if (now - lastTime >= 1000) {
      fps = frameCount;
      frameCount = 0;
      lastTime = now;
    }
    return fps;
  }

  // Main debug function
  window.__PIXI_CLI_DEBUG__ = {
    getInfo: function() {
      const pixi = findPixi();
      if (!pixi) return { error: 'PixiJS not found' };

      return {
        version: pixi.version || 'unknown',
        majorVersion: pixi.version?.split('.')[0] || 'unknown',
        hasApp: !!pixi.app,
        hasStage: !!pixi.stage,
        hasRenderer: !!pixi.renderer
      };
    },

    getSceneGraph: function() {
      const pixi = findPixi();
      if (!pixi?.stage) return { error: 'No stage found' };
      return buildSceneGraph(pixi.stage);
    },

    getStats: function() {
      const pixi = findPixi();
      if (!pixi?.stage) return { error: 'No stage found' };
      return collectStats(pixi.stage);
    },

    getRendering: function() {
      const pixi = findPixi();
      if (!pixi?.renderer) return { error: 'No renderer found' };
      return getRenderingInfo(pixi.renderer);
    },

    getTextures: function() {
      const pixi = findPixi();
      if (!pixi?.renderer) return { error: 'No renderer found' };
      return getTextureInfo(pixi.renderer);
    },

    getInstructions: function() {
      const pixi = findPixi();
      if (!pixi?.renderer || !pixi?.stage) return { error: 'No renderer or stage found' };
      return getRenderInstructions(pixi.renderer, pixi.stage);
    },

    getFps: function() {
      return measureFps();
    },

    getAll: function() {
      return {
        info: this.getInfo(),
        sceneGraph: this.getSceneGraph(),
        stats: this.getStats(),
        rendering: this.getRendering(),
        textures: this.getTextures(),
        instructions: this.getInstructions()
      };
    },

    // Full frame capture with render pipeline profiling
    capture: function() {
      const pixi = findPixi();
      if (!pixi?.renderer || !pixi?.stage) return { error: 'No renderer or stage found' };

      const renderer = pixi.renderer;
      const stage = pixi.stage;

      // Check if v8 with instruction set
      if (!stage.renderGroup?.instructionSet) {
        return { error: 'Capture requires PixiJS v8 with render groups' };
      }

      // Measure render time
      const startTime = performance.now();
      renderer.render(stage);
      const renderTime = performance.now() - startTime;

      // Capture draw calls per pipe
      const drawOrder = [];
      const pipeTimings = {};
      let totalDrawCalls = 0;

      const instructionSet = stage.renderGroup.instructionSet;
      const renderPipes = instructionSet.renderPipes;
      const originalExecuteFns = new Map();

      // Hook into each render pipe to measure timing and draw calls
      Object.keys(renderPipes).forEach(key => {
        const pipe = renderPipes[key];
        if (!pipe.execute) return;

        originalExecuteFns.set(key, pipe.execute);
        pipeTimings[key] = { time: 0, calls: 0, drawCalls: 0 };

        pipe.execute = function(...args) {
          const pipeStart = performance.now();
          pipeTimings[key].calls++;

          // Track draw calls for this pipe
          let pipeDrawCalls = 0;
          if (renderer.gl) {
            const gl = renderer.gl;
            const origDraw = gl.drawElements;
            const origDrawArrays = gl.drawArrays;
            gl.drawElements = function(...drawArgs) {
              pipeDrawCalls++;
              totalDrawCalls++;
              return origDraw.apply(gl, drawArgs);
            };
            gl.drawArrays = function(...drawArgs) {
              pipeDrawCalls++;
              totalDrawCalls++;
              return origDrawArrays.apply(gl, drawArgs);
            };

            const result = originalExecuteFns.get(key).apply(pipe, args);

            gl.drawElements = origDraw;
            gl.drawArrays = origDrawArrays;

            pipeTimings[key].time += performance.now() - pipeStart;
            pipeTimings[key].drawCalls += pipeDrawCalls;

            drawOrder.push({ pipe: key, drawCalls: pipeDrawCalls, time: performance.now() - pipeStart });
            return result;
          }

          const result = originalExecuteFns.get(key).apply(pipe, args);
          pipeTimings[key].time += performance.now() - pipeStart;
          drawOrder.push({ pipe: key, drawCalls: 0, time: performance.now() - pipeStart });
          return result;
        };
      });

      // Run profiled render
      const profiledStart = performance.now();
      renderer.render(stage);
      const profiledRenderTime = performance.now() - profiledStart;

      // Restore original functions
      Object.keys(renderPipes).forEach(key => {
        const pipe = renderPipes[key];
        if (originalExecuteFns.has(key)) {
          pipe.execute = originalExecuteFns.get(key);
        }
      });

      // Helper to get renderable data
      function getRenderableData(container) {
        if (!container) return null;
        return {
          class: container.constructor?.name,
          type: getPixiType(container),
          label: container.label,
          position: { x: container.position?.x, y: container.position?.y },
          width: container.width,
          height: container.height,
          scale: { x: container.scale?.x, y: container.scale?.y },
          anchor: container.anchor ? { x: container.anchor.x, y: container.anchor.y } : null,
          rotation: container.rotation,
          angle: container.angle,
          pivot: { x: container.pivot?.x, y: container.pivot?.y },
          skew: { x: container.skew?.x, y: container.skew?.y },
          visible: container.visible,
          renderable: container.renderable,
          alpha: container.alpha,
          tint: container.tint,
          blendMode: container.blendMode,
          zIndex: container.zIndex,
          isRenderGroup: container.isRenderGroup
        };
      }

      // Helper to get state data
      function getStateData(state) {
        if (!state) return null;
        return {
          blend: state.blend,
          blendMode: state.blendMode,
          cullMode: state.cullMode,
          culling: state.culling,
          depthMask: state.depthMask,
          depthTest: state.depthTest
        };
      }

      // Helper to get texture info
      function getTextureInfo(texture) {
        if (!texture) return null;
        const source = texture._source || texture.source || texture;
        return {
          label: source.label || 'unnamed',
          width: source.width,
          height: source.height,
          pixelWidth: source.pixelWidth,
          pixelHeight: source.pixelHeight,
          format: source.format
        };
      }

      // Helper to get shader source
      function getShaderSource(filter, shaderType) {
        const isWebGPU = renderer.type === 0b10;
        const programType = isWebGPU ? 'gpuProgram' : 'glProgram';
        let program = filter.blurXFilter ? filter.blurXFilter[programType] : filter[programType];
        if (!program) return '';
        const source = program[shaderType];
        if (!source) return '';
        return typeof source === 'string' ? source : source.source || '';
      }

      // Build instruction tree with full details
      const instructions = [];
      function processInstructionSet(instSet, depth = 0) {
        const result = [];
        for (let i = 0; i < instSet.instructionSize; i++) {
          const inst = instSet.instructions[i];
          const instData = {
            index: instructions.length,
            type: inst.renderPipeId || 'unknown',
            action: inst.action || 'execute',
            depth: depth
          };

          // Add type-specific detailed data
          if (inst.renderPipeId === 'batch') {
            instData.blendMode = inst.blendMode;
            instData.size = inst.size;
            instData.start = inst.start;
            instData.textures = [];
            if (inst.textures?.textures) {
              inst.textures.textures.forEach(tex => {
                if (tex) instData.textures.push(getTextureInfo(tex));
              });
            }
          }
          else if (inst.renderPipeId === 'filter') {
            instData.filters = inst.filterEffect?.filters?.map(f => ({
              type: f.constructor.name,
              padding: f.padding,
              resolution: f.resolution,
              antialias: f.antialias,
              blendMode: f.blendMode,
              program: {
                vertex: getShaderSource(f, 'vertex'),
                fragment: getShaderSource(f, 'fragment')
              },
              state: getStateData(f._state)
            })) || [];
            instData.renderables = inst.renderables?.map(r => ({
              ...getRenderableData(r),
              texture: getTextureInfo(r.texture)
            })) || [];
          }
          else if (inst.renderPipeId === 'graphics') {
            instData.renderable = getRenderableData(inst);
          }
          else if (inst.renderPipeId === 'mesh') {
            const mesh = inst.mesh || inst;
            instData.renderable = {
              ...getRenderableData(mesh),
              texture: getTextureInfo(mesh.texture),
              state: getStateData(mesh.state),
              geometry: mesh.geometry ? {
                vertexCount: mesh.geometry.positions?.length / 2 || 0,
                indexCount: mesh.geometry.indices?.length || 0
              } : null
            };
          }
          else if (inst.renderPipeId === 'tilingSprite') {
            instData.renderable = {
              ...getRenderableData(inst),
              texture: getTextureInfo(inst.texture),
              tilePosition: { x: inst.tilePosition?.x, y: inst.tilePosition?.y },
              tileScale: { x: inst.tileScale?.x, y: inst.tileScale?.y },
              tileRotation: inst.tileRotation,
              clampMargin: inst.clampMargin
            };
          }
          else if (inst.renderPipeId === 'nineSliceSprite') {
            instData.renderable = {
              ...getRenderableData(inst),
              texture: getTextureInfo(inst.texture),
              leftWidth: inst.leftWidth,
              rightWidth: inst.rightWidth,
              topHeight: inst.topHeight,
              bottomHeight: inst.bottomHeight,
              originalWidth: inst.originalWidth,
              originalHeight: inst.originalHeight
            };
          }
          else if (inst.renderPipeId === 'stencilMask' || inst.renderPipeId === 'alphaMask' || inst.renderPipeId === 'colorMask') {
            instData.maskType = inst.renderPipeId;
            if (inst.mask?.mask) {
              instData.mask = getRenderableData(inst.mask.mask);
            }
          }
          else if (inst.renderPipeId === 'renderGroup') {
            instData.type = 'renderGroup';
            if (inst.instructionSet) {
              instData.children = processInstructionSet(inst.instructionSet, depth + 1);
            }
          }

          instructions.push(instData);
          result.push(instData);
        }
        return result;
      }
      processInstructionSet(instructionSet);

      // Count scene objects
      const totals = {
        containers: 0, sprites: 0, graphics: 0, meshes: 0,
        texts: 0, tilingSprites: 0, nineSliceSprites: 0,
        filters: 0, masks: 0
      };
      function countScene(container) {
        if (!container) return;
        const type = getPixiType(container);
        switch(type) {
          case 'Container': totals.containers++; break;
          case 'Sprite': case 'AnimatedSprite': totals.sprites++; break;
          case 'Graphics': totals.graphics++; break;
          case 'Mesh': totals.meshes++; break;
          case 'Text': case 'BitmapText': case 'HTMLText': totals.texts++; break;
          case 'TilingSprite': totals.tilingSprites++; break;
          case 'NineSliceSprite': totals.nineSliceSprites++; break;
        }
        if (container.effects) totals.filters += Array.isArray(container.effects) ? container.effects.length : 1;
        if (container.mask) totals.masks++;
        if (container.children) container.children.forEach(countScene);
      }
      countScene(stage);

      // Get memory
      let memory = null;
      if (performance.memory) {
        memory = {
          usedJSHeapSize: Math.round(performance.memory.usedJSHeapSize / 1048576),
          totalJSHeapSize: Math.round(performance.memory.totalJSHeapSize / 1048576),
          jsHeapSizeLimit: Math.round(performance.memory.jsHeapSizeLimit / 1048576)
        };
      }

      return {
        renderTime: Number(renderTime.toFixed(3)),
        profiledRenderTime: Number(profiledRenderTime.toFixed(3)),
        drawCalls: totalDrawCalls,
        instructionCount: instructionSet.instructionSize,
        totals: totals,
        pipeTimings: Object.fromEntries(
          Object.entries(pipeTimings)
            .filter(([_, v]) => v.calls > 0)
            .map(([k, v]) => [k, {
              time: Number(v.time.toFixed(3)),
              calls: v.calls,
              drawCalls: v.drawCalls
            }])
        ),
        instructions: instructions,
        drawOrder: drawOrder.map(d => ({
          pipe: d.pipe,
          drawCalls: d.drawCalls,
          time: Number(d.time.toFixed(3))
        })),
        memory: memory,
        canvas: {
          width: renderer.canvas?.width || renderer.view?.width,
          height: renderer.canvas?.height || renderer.view?.height,
          resolution: renderer.resolution
        }
      };
    },

    // Benchmark - run multiple captures over time
    benchmark: function(durationMs = 3000) {
      const pixi = findPixi();
      if (!pixi?.renderer || !pixi?.stage) return { error: 'No renderer or stage found' };

      const renderer = pixi.renderer;
      const stage = pixi.stage;

      const startTime = performance.now();
      const frames = [];
      let frameCount = 0;

      while (performance.now() - startTime < durationMs) {
        const frameStart = performance.now();
        renderer.render(stage);
        const frameEnd = performance.now();

        frames.push(frameEnd - frameStart);
        frameCount++;
      }

      const totalTime = performance.now() - startTime;
      const avgFrameTime = frames.reduce((a, b) => a + b, 0) / frames.length;
      const sortedFrames = [...frames].sort((a, b) => a - b);

      return {
        duration: Number(totalTime.toFixed(0)),
        frameCount: frameCount,
        fps: Number((frameCount / (totalTime / 1000)).toFixed(1)),
        frameTime: {
          avg: Number(avgFrameTime.toFixed(3)),
          min: Number(sortedFrames[0].toFixed(3)),
          max: Number(sortedFrames[sortedFrames.length - 1].toFixed(3)),
          p50: Number(sortedFrames[Math.floor(frames.length * 0.5)].toFixed(3)),
          p95: Number(sortedFrames[Math.floor(frames.length * 0.95)].toFixed(3)),
          p99: Number(sortedFrames[Math.floor(frames.length * 0.99)].toFixed(3))
        }
      };
    }
  };

  return 'PixiJS CLI Debug injected successfully';
})();
`;
