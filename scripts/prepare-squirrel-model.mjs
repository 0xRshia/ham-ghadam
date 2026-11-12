import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTMeshoptCompression } from "@gltf-transform/extensions";
import { compactPrimitive, dedup, reorder, textureCompress, weld } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";

// Run manually when replacing the authored asset. Normal builds use the checked
// in, content-addressed GLB and never need the user's original ZIP or Blender.
const source = process.argv[2];
if (!source) throw new Error("Usage: node scripts/prepare-squirrel-model.mjs /path/to/HamGhadam_Exact_Model_Animations.glb [output-directory]");
const destination = process.argv[3] ?? new URL("../public/game/mascot/", import.meta.url).pathname;
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready,MeshoptSimplifier.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({"meshopt.encoder":MeshoptEncoder,"meshopt.decoder":MeshoptDecoder});
const sourceBytes = await readFile(source);
const document = await io.readBinary(sourceBytes);
const arrayHash = array => sha(Buffer.from(array.buffer,array.byteOffset,array.byteLength));
const animationSignature = doc => doc.getRoot().listAnimations().map(animation => ({name:animation.getName(),channels:animation.listChannels().map(channel => {
  const sampler=channel.getSampler();
  return {node:channel.getTargetNode().getName(),path:channel.getTargetPath(),interpolation:sampler.getInterpolation(),input:arrayHash(sampler.getInput().getArray()),output:arrayHash(sampler.getOutput().getArray())};
})}));
const animationsBefore=animationSignature(document);
const counts = doc => doc.getRoot().listMeshes().flatMap(mesh=>mesh.listPrimitives()).reduce((out,primitive)=>({vertices:out.vertices+primitive.getAttribute("POSITION").getCount(),triangles:out.triangles+primitive.getIndices().getCount()/3}),{vertices:0,triangles:0});
const before=counts(document);
await document.transform(dedup(),weld());
for (const mesh of document.getRoot().listMeshes()) for (const primitive of mesh.listPrimitives()) {
  const positions=primitive.getAttribute("POSITION"), normals=primitive.getAttribute("NORMAL"), uv=primitive.getAttribute("TEXCOORD_0"), joints=primitive.getAttribute("JOINTS_0"), weights=primitive.getAttribute("WEIGHTS_0");
  assert.ok(joints && weights,"Expected the supplied skinned mascot");
  const attributes=new Float32Array(positions.getCount()*13), n=[], t=[], j=[], w=[];
  for (let i=0;i<positions.getCount();i++) {
    normals.getElement(i,n);uv.getElement(i,t);joints.getElement(i,j);weights.getElement(i,w);
    attributes.set([...n,...t,...j.map(value=>value/34),...w],i*13);
  }
  // Include normal/UV and skin-weight errors when selecting retained vertices.
  // Bone animation, bind matrices, and the rig hierarchy are never rebaked.
  const [indices,error]=MeshoptSimplifier.simplifyWithAttributes(new Uint32Array(primitive.getIndices().getArray()),positions.getArray(),3,attributes,13,[.02,.02,.02,.1,.1,.1,.1,.1,.1,.2,.2,.2,.2],null,Math.floor(primitive.getIndices().getCount()*.2/3)*3,.001);
  primitive.getIndices().setArray(indices);compactPrimitive(primitive);
  console.log("Simplification error:",error);
}
await document.transform(
  textureCompress({encoder:sharp,targetFormat:"webp",resize:[2048,2048],slots:/baseColorTexture/,lossless:true,effort:80}),
  textureCompress({encoder:sharp,targetFormat:"webp",resize:[1024,1024],slots:/normalTexture|metallicRoughnessTexture/,lossless:true,effort:80}),
  reorder({encoder:MeshoptEncoder,target:"size"}),
);
// Lossless buffer compression also keeps every authored animation key intact.
document.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({method:EXTMeshoptCompression.EncoderMethod.QUANTIZE});
const output=await io.writeBinary(document);
const verified=await io.readBinary(output);
assert.deepEqual(animationSignature(verified),animationsBefore,"All nine authored animation channels and keys must remain identical");
const digest=sha(output),file=`hamghadam-${digest.slice(0,12)}.glb`;
const manifest={version:1,file,sha256:digest,bytes:output.byteLength,source:{file:path.basename(source),sha256:sha(sourceBytes),bytes:sourceBytes.byteLength,...before},geometry:counts(verified),processing:{tool:"glTF Transform 4.5.1 / meshoptimizer 1.1.1",triangleRatio:.2,maxError:.001,textures:"2048px base color; 1024px normal/metal-roughness; lossless WebP after resizing",buffers:"lossless EXT_meshopt_compression",animationKeysUnchanged:true},clips:verified.getRoot().listAnimations().map(animation=>({name:animation.getName(),duration:Math.max(...animation.listSamplers().map(s=>s.getInput().getMax([])[0])),channels:animation.listChannels().length})),jointCount:verified.getRoot().listSkins()[0].listJoints().length};
await mkdir(destination,{recursive:true});
await writeFile(path.join(destination,file),output);
await writeFile(path.join(destination,"manifest.json"),JSON.stringify(manifest,null,2)+"\n");
console.log(JSON.stringify(manifest,null,2));
