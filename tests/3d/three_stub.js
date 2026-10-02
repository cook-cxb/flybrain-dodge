// Minimal stand-in for the parts of three.js r128 that ui3d.js touches, so the wiring (event handlers,
// control logic, DOM updates) can be exercised in Node/jsdom, which has no WebGL. This does NOT verify
// that anything actually renders correctly on a GPU -- only that the glue code around three.js runs
// without throwing and drives the DOM the way it should.
function O3D() { this.position = new Vector3(0,0,0); this.rotation = { x: 0, y: 0, z: 0 }; this.scale = new Vector3(1,1,1);
  this.quaternion = { setFromAxisAngle(){return this;}, setFromRotationMatrix(){return this;} };
  this.visible = true; this.children = []; }
O3D.prototype.add = function (c) { this.children.push(c); return this; };
function Vector3(x,y,z){ this.x=x||0; this.y=y||0; this.z=z||0; }
Vector3.prototype.set=function(x,y,z){this.x=x;this.y=y;this.z=z;return this;};
Vector3.prototype.copy=function(v){this.x=v.x;this.y=v.y;this.z=v.z;return this;};
Vector3.prototype.clone=function(){return new Vector3(this.x,this.y,this.z);};
Vector3.prototype.add=function(v){this.x+=v.x;this.y+=v.y;this.z+=v.z;return this;};
Vector3.prototype.multiplyScalar=function(s){this.x*=s;this.y*=s;this.z*=s;return this;};
Vector3.prototype.applyQuaternion=function(){return this;};
Vector3.prototype.lerp=function(v,t){this.x+=(v.x-this.x)*t;this.y+=(v.y-this.y)*t;this.z+=(v.z-this.z)*t;return this;};
Vector3.prototype.setScalar=function(s){this.x=this.y=this.z=s;return this;};
Vector3.prototype.sub=function(v){this.x-=v.x;this.y-=v.y;this.z-=v.z;return this;};
Vector3.prototype.cross=function(v){const x=this.y*v.z-this.z*v.y,y=this.z*v.x-this.x*v.z,z=this.x*v.y-this.y*v.x;this.x=x;this.y=y;this.z=z;return this;};
Vector3.prototype.length=function(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z);};
Vector3.prototype.lengthSq=function(){return this.x*this.x+this.y*this.y+this.z*this.z;};
Vector3.prototype.normalize=function(){const l=this.length()||1;this.x/=l;this.y/=l;this.z/=l;return this;};
function Vector2(){ this.x=0; this.y=0; }
function Color(v){ this._v=v; } Color.prototype.getHex=function(){return 0;}; Color.prototype.set=function(v){this._v=v;return this;};
function Mat(){} Mat.prototype.makeBasis=function(){return this;};
function mk(){ const o=new O3D(); o.clone=function(){ const c=new O3D(); Object.assign(c,this); c.position=this.position.clone(); return c; }; return o; }
module.exports = {
  Scene: function(){ const s=new O3D(); s.background=null; s.fog=null; return s; },
  PerspectiveCamera: function(fov,aspect){ const c=new O3D(); c.fov=fov; c.aspect=aspect; c.up=new Vector3(0,1,0); c.updateProjectionMatrix=()=>{}; c.lookAt=()=>{}; c.getWorldDirection=function(target){ target.set(0,0,-1); return target; }; return c; },
  WebGLRenderer: function(opts){ return { domElement: opts.canvas, setPixelRatio(){}, setSize(){}, render(){} }; },
  Color, Fog: function(){ return {}; },
  HemisphereLight: mk, DirectionalLight: mk, Group: O3D,
  BoxGeometry: function(){ return {}; }, EdgesGeometry: function(){ return {}; },
  LineSegments: function(){ return mk(); }, LineBasicMaterial: function(o){ return Object.assign({ color:{set(){}} }, o); },
  GridHelper: function(){ return mk(); },
  PlaneGeometry: function(){ return {}; },
  MeshBasicMaterial: function(o){ return Object.assign({ color:{set(){}}, opacity:1, transparent:false }, o); },
  Mesh: function(geo,mat){ const m=mk(); m.geometry=geo; m.material=mat; return m; },
  MeshStandardMaterial: function(o){ const m={ color:{set(){}}, emissive:{set(){}}, roughness:.5 }; if(o) for(const k in o) if(k!=='color'&&k!=='emissive') m[k]=o[k]; return m; },
  ConeGeometry: function(){ return {}; }, SphereGeometry: function(){ return {}; },
  BufferGeometry: function(){ return { setAttribute(){}, attributes:{ position:{ needsUpdate:false } }, setDrawRange(){}, computeVertexNormals(){} }; },
  BufferAttribute: function(arr){ return { array: arr }; },
  Line: function(){ return mk(); },
  Matrix4: Mat, Vector3, Vector2, Quaternion: function(){ return { setFromAxisAngle(){return this;} }; },
  Raycaster: function(){ return { setFromCamera(){}, intersectObject(plane){ return [{ point: new Vector3(0, 0, 0) }]; } }; },
  DoubleSide: 2, SRGBColorSpace: 'srgb',
  TextureLoader: function(){ return { load(){ return { colorSpace: null, encoding: null }; } }; },
};
