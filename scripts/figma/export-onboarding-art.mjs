import fs from 'node:fs/promises';
import sharp from 'sharp';
const nodes=JSON.parse(await fs.readFile('docs/figma/source/local-document.json','utf8'));
const key=id=>`${id.sessionID}:${id.localID}`;
const byId=new Map(nodes.map(node=>[key(node.guid),node]));
const exports=[
  ['104:4','1466:6537','2. Onboarding - 1.png','discover-light'],
  ['1440:4148','1466:6546','2. Onboarding - 2.png','discover-dark'],
  ['104:5','1466:6596','3. Onboarding - 2.png','follow-light'],
  ['1440:4145','1466:6604','3. Onboarding - 3.png','follow-dark'],
  ['104:6','1483:12046','4. Get Started-1.png','start-light'],
  ['1440:4134','1483:12058','4. Get Started.png','start-dark'],
];
await fs.mkdir('public/figma/onboarding',{recursive:true});
const manifest={};
for(const [frameId,nodeId,reference,name] of exports){
  const node=byId.get(nodeId);let current=node,left=0,top=0;
  while(key(current.guid)!==frameId){
    const t=current.transform;
    if(t && (t.m00!==1 || t.m11!==1 || t.m01!==0 || t.m10!==0))throw new Error('Rotated ancestor needs a different export');
    left+=t?.m02??0;top+=t?.m12??0;current=byId.get(key(current.parentIndex.guid));
  }
  const input='docs/figma/reference/'+reference;const meta=await sharp(input).metadata();
  if(meta.width!==750 || meta.height!==1624)throw new Error('Reference must be the supplied 2×375×812 export');
  const rectangle={left:left*2,top:top*2,width:node.size.x*2,height:node.size.y*2};
  // Only the photograph collage is extracted: no headings, controls, or page chrome.
  await sharp(input).extract(rectangle).webp({lossless:true}).toFile(`public/figma/onboarding/${name}.webp`);
  manifest[name]={frameId,nodeId,reference,rectangle,src:`/figma/onboarding/${name}.webp`,width:node.size.x,height:node.size.y};
}
await fs.writeFile('components/evenline/onboarding-art.json',JSON.stringify(manifest,null,2)+'\n');
