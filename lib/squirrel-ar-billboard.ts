import * as THREE from "three";

// The existing Hamghadam SVG rig, drawn as an animated transparent texture.
// This upright plane lives in world space and turns around its vertical axis;
// perspective and distance come from the tracked camera, never CSS position.
export function createSquirrelBillboard() {
  const canvas=document.createElement("canvas"); canvas.width=600; canvas.height=644;
  const ctx=canvas.getContext("2d",{willReadFrequently:true});
  if (!ctx) throw new Error("2D character canvas unavailable");
  const texture=new THREE.CanvasTexture(canvas); texture.colorSpace=THREE.SRGBColorSpace;
  texture.minFilter=THREE.LinearFilter; texture.generateMipmaps=false;
  const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,alphaTest:.04,side:THREE.DoubleSide,depthWrite:false,toneMapped:false});
  const plane=new THREE.Mesh(new THREE.PlaneGeometry(.56*300/322,.56),material);
  plane.name="squirrel-illustration"; plane.position.y=.28; plane.position.x=.56*28/322;
  const root=new THREE.Group(); root.name="squirrel-model"; root.userData.character="2d"; root.add(plane);
  const paths=new Map<string,Path2D>();
  const orange="#E77A1B", dark="#C65D13", cream="#F5DFC4", outline="#87451F";
  function path(d:string,fill:string | null,stroke:string | null=outline,width=1.6) {
    let p=paths.get(d); if (!p) {p=new Path2D(d);paths.set(d,p);}
    if (fill) {ctx!.fillStyle=fill;ctx!.fill(p);}
    if (stroke) {ctx!.strokeStyle=stroke;ctx!.lineWidth=width;ctx!.stroke(p);}
  }
  function pivot(x:number,y:number,rotation:number,draw:()=>void) {ctx!.save();ctx!.translate(x,y);ctx!.rotate(rotation);ctx!.translate(-x,-y);draw();ctx!.restore();}
  let lastFrame=-1;
  function animate(time:number,running:boolean,caught:boolean,reduced:boolean) {
    const frame=Math.floor(time*(reduced ? 2 : 24));
    if (frame===lastFrame) return; lastFrame=frame;
    ctx!.setTransform(1,0,0,1,0,0);ctx!.clearRect(0,0,600,644);
    ctx!.scale(2,2);ctx!.lineJoin="round";ctx!.lineCap="round";
    const facing=root.userData.facing === -1 ? -1 : 1;
    plane.position.x=.56*28/322*facing;
    if (facing === -1) {ctx!.translate(300,0);ctx!.scale(-1,1);}
    const swing=reduced ? 0 : Math.sin(time*(running ? 22 : 3));
    ctx!.translate(0,running && !reduced ? -Math.abs(swing)*4 : 0);
    pivot(155,279,swing*(running ? .1 : .035),()=>{
      path("M140 281C172 263 162 236 174 218C155 171 163 119 193 94C229 64 278 78 286 118C297 165 279 229 241 244C215 255 197 240 201 215C204 196 218 180 219 159C217 184 197 198 194 227C191 259 170 284 140 291Z",dark);
      path("M183 216C169 175 177 125 207 107C234 90 260 101 264 131C269 163 257 194 240 203",null,"#E99539",9);
      path("M184 249C195 223 185 192 205 161C218 141 235 146 232 168C231 178 226 185 222 188",null,cream,3);
    });
    pivot(135,275,running ? -swing*.52 : 0,()=>path("M135 274L147 309C150 313 165 309 170 315C172 321 155 323 143 320C135 316 126 297 123 281Z",dark));
    pivot(110,275,running ? swing*.52 : 0,()=>path("M110 272L102 309C94 308 78 309 76 316C76 324 99 323 110 319L126 280Z","#DD731D"));
    path("M112 146C113 181 110 204 98 241C87 277 101 294 124 295C153 295 164 275 151 244C137 212 135 174 135 147Z",orange);
    path("M119 160C126 192 112 224 108 253C105 276 114 284 125 284C139 284 143 272 137 251C129 225 127 195 128 161Z",cream,null);
    pivot(136,188,caught ? -2.3 : running ? swing*.7 : 0,()=>path("M136 188C152 209 162 236 154 245C146 249 141 241 141 233L128 209",dark));
    pivot(109,190,caught ? 2.4 : running ? -swing*.7 : 0,()=>{
      path("M109 190C102 207 100 225 104 242C106 248 115 246 116 240L120 204",orange);
      path("M105 241L110 248L115 242",null,outline,2);
    });
    pivot(122,148,running ? swing*.025 : swing*.045,()=>{
      path("M48 78L61 27L88 44L112 22L137 42L159 24L176 77L204 101L173 128L130 157L115 157L73 133L37 105Z",orange);
      path("M56 72L64 44L78 54Z",outline,null);path("M153 53L160 41L168 72Z",outline,null);
      path("M40 105L72 88L96 107L121 119L144 107L170 87L202 101L171 126L130 151L115 151L75 128Z",cream);
      path("M46 105L65 98L70 115Z","#DE8A76",null);path("M179 98L196 104L176 116Z","#DE8A76",null);
      if (!reduced && Math.sin(time*.8) > .997) {
        path("M64 88Q78 96 94 87M148 88Q165 96 179 87",null,outline,3);
      } else {
        path("M94 84C94 61 64 61 62 86C59 111 91 116 94 94Z","#FFF9ED");
        path("M148 84C149 60 179 64 179 87C179 112 149 114 148 94Z","#FFF9ED");
        path("M77 75V98C86 99 88 87 84 78Z",outline,null);path("M163 75V98C172 98 173 84 168 77Z",outline,null);
      }
      path("M108 106L121 94L135 106ZM111 111H133L122 119Z",outline,null);
      path(caught ? "M106 128Q122 149 138 128Z" : "M112 133Q122 126 132 133",caught ? outline : null,outline,2.5);
      path("M56 63L49 71M180 63L187 71",null,outline,4);
    });
    texture.needsUpdate=true;
  }
  animate(0,false,false,false);
  return {root,animate,hit(intersections:THREE.Intersection[]) {
    return intersections.some(hit=>{
      if (!hit.uv) return false;
      const x=Math.max(0,Math.min(599,Math.floor(hit.uv.x*600))), y=Math.max(0,Math.min(643,Math.floor((1-hit.uv.y)*644)));
      return ctx.getImageData(x,y,1,1).data[3] > 40;
    });
  }};
}
