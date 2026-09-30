"""Export only category decoration; localized titles/counts remain live UI."""
import copy, json, pathlib, runpy, sys
sys.argv=['scripts/figma/export-assets.py','work/figma/decoded.json','public/figma/vectors']
source=runpy.run_path(sys.argv[0]); nodes,expand,draw,key,path,num=[source[k] for k in ['nodes','expand','draw','key','path','num']]
out=pathlib.Path('public/figma/categories');out.mkdir(exist_ok=True)
manifest={}
for variant,id in enumerate(['1444:11141','1444:11139','1444:11149'],1):
 tree=expand(nodes[id]); pattern=next(x for x in tree['children'] if x['name']=='pattern')
 mask=next(x for x in pattern['children'] if x.get('mask'))
 assert mask['size']=={'x':327,'y':160} and mask['transform']['m02']==0 and mask['transform']['m12']==0
 pattern['children']=[x for x in pattern['children'] if not x.get('mask')]
 clip=''.join(f'<path d="{path(g["commandsBlob"])}"/>' for g in mask['fillGeometry'])
 svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="327" height="160" viewBox="0 0 327 160"><defs><clipPath id="bounds">{clip}</clipPath></defs><g clip-path="url(#bounds)">{draw(pattern,True)}</g></svg>'
 (out/f'pattern-{variant}.svg').write_text(svg)
 # Reposition the decoration groups around RTL text; never reflect their paths.
 # This preserves the source drawing orientation while moving dense art away from the label.
 rtl=copy.deepcopy(pattern)
 for child in rtl['children']:
  t=child['transform'];w,h=child['size']['x'],child['size']['y']
  xs=[t['m00']*x+t['m01']*y+t['m02'] for x,y in [(0,0),(w,0),(0,h),(w,h)]]
  t['m02']+=327-min(xs)-max(xs)
 rtl_svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="327" height="160" viewBox="0 0 327 160"><defs><clipPath id="bounds">{clip}</clipPath></defs><g clip-path="url(#bounds)">{draw(rtl,True)}</g></svg>'
 (out/f'pattern-{variant}-rtl.svg').write_text(rtl_svg)
 chip=next(x for x in tree['children'] if x['name']=='chip')
 color=source['solid'](source['paints'](chip)[0])[0]
 manifest[str(variant)]={'source':id,'src':f'/figma/categories/pattern-{variant}-rtl.svg','chipColor':color}
pathlib.Path('components/evenline/category-art.json').write_text(json.dumps(manifest,indent=2))
