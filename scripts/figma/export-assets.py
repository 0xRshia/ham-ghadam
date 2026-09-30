"""Export standalone Figma vectors from decoded local .fig geometry; never whole screens.
Usage: python3 scripts/figma/export-assets.py decoded.json output-directory
The decoder is an offline tool; this exporter has no application dependency.
"""
import collections, copy, json, pathlib, struct, sys
source=json.load(open(sys.argv[1])); out=pathlib.Path(sys.argv[2]); out.mkdir(parents=True,exist_ok=True)
def key(g): return f"{g['sessionID']}:{g['localID']}"
nodes={key(n['guid']):n for n in source['nodeChanges']}; children=collections.defaultdict(list)
for n in nodes.values():
 if n.get('parentIndex'): children[key(n['parentIndex']['guid'])].append(n)
for v in children.values(): v.sort(key=lambda n:n['parentIndex']['position'])
def num(v): return format(v,'.9g')
def path(index):
 raw=source['blobs'][index]['bytes']; b=bytes(raw.values()) if isinstance(raw,dict) else bytes(raw); pos=0; result=[]
 while pos<len(b):
  op=b[pos];pos+=1; count=[0,2,2,4,6][op]; vals=struct.unpack_from('<'+'f'*count,b,pos);pos+=count*4
  result.append('ZMLQC'[op]+(' '.join(num(v) for v in vals)))
 return ' '.join(result)
def scope(n):
 entries={}
 for e in n.get('derivedSymbolData',[])+n.get('symbolData',{}).get('symbolOverrides',[]):
  p=tuple(key(g) for g in e['guidPath']['guids']);entries.setdefault(p,{}).update(e)
 return entries
# Scope paths contain only intervening instances, followed by the descendant's ID.
def expand(original, scopes=(),depth=0):
 if depth>32: raise ValueError('Cyclic instance')
 n=copy.deepcopy(original);id=key(n['guid'])
 for mapping,prefix in reversed(scopes): n.update(mapping.get(prefix+(id,),{}))
 if n.get('type')=='INSTANCE':
  base=nodes[key(n['symbolData']['symbolID'])]; merged={**base,**n}
  own=scope(n);newscopes=tuple((m,p+(id,)) for m,p in scopes)+((own,()),)
  merged['children']=[expand(c,newscopes,depth+1) for c in children[key(base['guid'])]]
  return merged
 n['children']=[expand(c,scopes,depth+1) for c in children[id]]
 return n
def paints(n,stroke=False):
 field='strokePaints' if stroke else 'fillPaints'; inherit='inheritFillStyleIDForStroke' if stroke else 'inheritFillStyleID'
 style=nodes.get(key(n[inherit]),{}) if inherit in n else {}
 return style.get('fillPaints',n.get(field,[]))
def solid(p):
 c=p['color']; return 'rgb('+','.join(num(c[v]*255) for v in ['r','g','b'])+')',p.get('opacity',1)*c.get('a',1)
def draw(n,root=False):
 if n.get('visible') is False: return ''
 t=n.get('transform',{});transform='' if root else ' transform="matrix('+ ' '.join(num(t.get(k,d)) for k,d in [('m00',1),('m10',0),('m01',0),('m11',1),('m02',0),('m12',0)])+')"'
 result=[]; filters=[]
 for i,e in enumerate(n.get('effects',[])):
  if not e.get('visible',True):continue
  if e['type']!='DROP_SHADOW' or e.get('spread',0):raise ValueError('Unsupported effect '+e['type'])
  color,opacity=solid({'color':e['color']}); fid='shadow-'+key(n['guid']).replace(':','-')+'-'+str(i)
  filters.append(f'<filter id="{fid}" x="-100%" y="-100%" width="300%" height="300%" color-interpolation-filters="sRGB"><feDropShadow dx="{num(e["offset"]["x"])}" dy="{num(e["offset"]["y"])}" stdDeviation="{num(e["radius"]/2)}" flood-color="{color}" flood-opacity="{num(opacity)}"/></filter>')
 for stroke in [False,True]:
  geometry=n.get('strokeGeometry' if stroke else 'fillGeometry',[])
  for paint_index,p in enumerate(paints(n,stroke)):
   if not p.get('visible',True):continue
   if not geometry:continue
   if p['type']=='SOLID': color,opacity=solid(p)
   elif p['type'] in ['GRADIENT_LINEAR','GRADIENT_RADIAL']:
    # Paint transform maps normalized local coordinates into gradient space.
    t=p['transform'];a,b,c,d,e,f=[t[k] for k in ['m00','m10','m01','m11','m02','m12']];det=a*d-b*c
    if abs(det)<1e-12:raise ValueError('Singular gradient transform')
    w,h=n['size']['x'],n['size']['y'];matrix=[w*d/det,-h*b/det,-w*c/det,h*a/det,w*(c*f-d*e)/det,h*(b*e-a*f)/det]
    gid='gradient-'+key(n['guid']).replace(':','-')+'-'+str(stroke)+'-'+str(paint_index)
    stops=''.join(f'<stop offset="{num(stop["position"])}" stop-color="{solid(stop)[0]}" stop-opacity="{num(stop["color"].get("a",1))}"/>' for stop in p['stops'])
    kind='linearGradient' if p['type']=='GRADIENT_LINEAR' else 'radialGradient'
    coordinates='x1="0" y1="0.5" x2="1" y2="0.5"' if kind=='linearGradient' else 'cx="0.5" cy="0.5" r="0.5"'
    result.append(f'<defs><{kind} id="{gid}" gradientUnits="userSpaceOnUse" {coordinates} gradientTransform="matrix({" ".join(num(v) for v in matrix)})">{stops}</{kind}></defs>')
    color,opacity='url(#'+gid+')',p.get('opacity',1)
   else: raise ValueError('Unsupported paint '+p['type'])
   for g in geometry: result.append(f'<path d="{path(g["commandsBlob"])}" fill="{color}" fill-opacity="{num(opacity)}" fill-rule="'+('evenodd' if g['windingRule']=='ODD' else 'nonzero')+'"/>')
 # Boolean geometry already contains the combined child paths.
 if not (n['type']=='BOOLEAN_OPERATION' and n.get('fillGeometry')):
  result += [draw(c) for c in n['children']]
 content=''.join(result)
 for f in filters:content='<g filter="url(#'+f.split('id="')[1].split('"')[0]+')">'+content+'</g>'
 return ''.join(filters)+'<g'+transform+' opacity="'+num(n.get('opacity',1))+'">'+content+'</g>'
manifest={};skipped=[]
for id,n in nodes.items():
 s=n.get('size',{}); parent=key(n['parentIndex']['guid']) if n.get('parentIndex') else ''
 if id not in ['1234:1060','1440:4045','1236:1173','1440:4027'] and (n.get('type')!='SYMBOL' or not (0<s.get('x',0)<=64 and 0<s.get('y',0)<=64 or parent=='1444:11703')):continue
 try:
  tree=expand(n)
  def validate(x):
   if x.get('type')=='TEXT' or x.get('mask') or any(e.get('visible',True) and e['type']!='DROP_SHADOW' for e in x.get('effects',[])):raise ValueError('Text, mask, or effect requires explicit export')
   for c in x['children']:validate(c)
  validate(tree)
  svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="{num(s["x"])}" height="{num(s["y"])}" viewBox="0 0 {num(s["x"])} {num(s["y"])}">'+draw(tree,True)+'</svg>'
  filename=id.replace(':','-')+'.svg';(out/filename).write_text(svg)
  manifest[id]={'name':n['name'],'src':'/figma/vectors/'+filename,'width':s['x'],'height':s['y']}
 except (ValueError,KeyError) as e:skipped.append({'id':id,'name':n['name'],'reason':str(e)})
(out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2));(out/'skipped.json').write_text(json.dumps(skipped,ensure_ascii=False,indent=2))
print('Exported',len(manifest),'Skipped',len(skipped))
# Retain effective source metadata for every screen, component, and style without font glyph blobs.
def clean(value):
 if isinstance(value,dict):return {k:clean(v) for k,v in value.items() if k not in ['glyphs','fontMetaData','vectorData','sharedSymbolVersion','phase']}
 if isinstance(value,list):return [clean(v) for v in value]
 return value
pathlib.Path('docs/figma/source/local-document.json').write_text(json.dumps(clean(source['nodeChanges']),ensure_ascii=False,separators=(',',':')))
# Export the small icon instances with each screen's resolved overrides (including dark).
screen_icons={}
for screen in children['0:1']:
 if screen.get('size')!={'x':375,'y':812}:continue
 screen_id=key(screen['guid']); collected=[]
 def icons(n):
  s=n.get('size',{})
  if n['type'] in ['INSTANCE','FRAME'] and n.get('name') not in ['icon','Icon','Group','item','text'] and 0<s.get('x',0)<=32 and 0<s.get('y',0)<=32:
   try:
    validate(n); svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="{num(s["x"])}" height="{num(s["y"])}" viewBox="0 0 {num(s["x"])} {num(s["y"])}">'+draw(n,True)+'</svg>'
    import hashlib
    filename=hashlib.sha256(svg.encode()).hexdigest()[:20]+'.svg';(out/filename).write_text(svg)
    collected.append({'name':n['name'],'node':key(n['guid']),'src':'/figma/vectors/'+filename,'width':s['x'],'height':s['y']})
    return
   except (ValueError,KeyError):pass
  for c in n['children']:icons(c)
 icons(expand(screen));screen_icons[screen_id]={'name':screen['name'],'icons':collected}
(out/'screen-icons.json').write_text(json.dumps(screen_icons,ensure_ascii=False,indent=2))
print('Screen icon variants:',len(screen_icons))
