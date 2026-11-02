// Deterministic poses for testing integration and world-space rendering.
// This fixture is intercepted only by Playwright; it is never shipped as AR.
(() => {
  const THREE = window.THREE;
  const test = window.__arTest = { surface:false, tracking:true, cameraX:0, runCount:0, stopCount:0, config:null };
  let modules = [], handle = 0, scene, camera, renderer;
  window.XR8 = {
    loadChunk: async () => {},
    stop() { cancelAnimationFrame(handle); test.stopCount++; },
    clearCameraPipelineModules() { modules = []; },
    addCameraPipelineModules(items) { modules.push(...items); },
    XrConfig: { device: () => ({MOBILE:"mobile"}), camera: () => ({BACK:"back"}) },
    XrDevice: { isDeviceBrowserCompatible: () => window.__arCompatible !== false },
    GlTextureRenderer: { pipelineModule: () => ({name:"gl"}) },
    Threejs: {
      xrScene: () => ({scene,camera,renderer}),
      pipelineModule: () => ({name:"three",onStart({canvas}) {
        scene = new THREE.Scene(); scene.background = new THREE.Color(0xdcd7c8);
        camera = new THREE.PerspectiveCamera(58,canvas.width/canvas.height,.01,100);
        camera.position.set(0,1.5,0); camera.lookAt(0,.24,-2);
        renderer = new THREE.WebGLRenderer({canvas,antialias:true}); renderer.setSize(canvas.width,canvas.height,false);
        const grid = new THREE.GridHelper(10,20,0x9b9485,0xc5beae); scene.add(grid);
      }}),
    },
    XrController: {
      configure(config) { test.config = config; },
      pipelineModule: () => ({name:"reality"}),
      updateCameraProjectionMatrix() {},
      hitTest: () => test.surface ? [{type:"ESTIMATED_SURFACE",position:{x:0,y:0,z:-2},distance:2.5,rotation:{x:0,y:0,z:0,w:1}}] : [],
    },
    async run({canvas,allowedDevices,cameraConfig}) {
      test.runCount++; test.allowedDevices=allowedDevices; test.cameraConfig=cameraConfig;
      test.tracking = true; // Each run represents a fresh SLAM session.
      if(window.__arDeny) { modules.forEach(module => module.onCameraStatusChange?.({status:"failed"})); return; }
      const stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:{exact:"environment"},width:{ideal:640}}});
      test.cameraDevice = stream.getVideoTracks()[0].getSettings().deviceId;
      modules.forEach(module => module.onCameraStatusChange?.({status:"hasStream",stream}));
      modules.forEach(module => module.onStart?.({canvas,canvasWidth:canvas.width,canvasHeight:canvas.height}));
      function tick() {
        camera.position.x=test.cameraX; camera.updateMatrixWorld();
        const reality={position:camera.position,rotation:camera.quaternion,intrinsics:camera.projectionMatrix.elements,trackingStatus:test.tracking?"NORMAL":"LIMITED",trackingReason:test.tracking?"UNSPECIFIED":"INITIALIZING"};
        modules.forEach(module => module.onUpdate?.({processCpuResult:{reality}}));
        renderer.render(scene,camera); handle=requestAnimationFrame(tick);
      }
      handle=requestAnimationFrame(tick);
    },
  };
  window.dispatchEvent(new Event("xrloaded"));
})();
