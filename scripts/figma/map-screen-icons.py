"""Merge newly exported icon names without changing established variant indices."""
import json, re, pathlib
source = json.loads(pathlib.Path('public/figma/vectors/screen-icons.json').read_text())
target = pathlib.Path('components/evenline/source-icons.json')
result = json.loads(target.read_text()) if target.exists() else {}
screens = {}
for node,screen in source.items():
    number = str(int(re.match(r'(\d+)',screen['name'])[1]))
    theme = 'light' if int(node.split(':')[0]) < 1400 else 'dark'
    by_name = {}
    for icon in screen['icons']:
        by_name.setdefault(icon['name'],[]).append({k:icon[k] for k in ['src','width','height']})
    screens.setdefault(number,{})[theme] = by_name
for number,themes in screens.items():
    dest = result.setdefault(number,{})
    for name,light in themes.get('light',{}).items():
        dark = themes.get('dark',{}).get(name,[])
        if name not in dest and len(light)==len(dark):
            dest[name] = [{'light':a,'dark':b} for a,b in zip(light,dark)]
target.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')

pathlib.Path('components/evenline/vector-manifest.json').write_text(pathlib.Path('public/figma/vectors/manifest.json').read_text())
