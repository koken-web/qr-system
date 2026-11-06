import json, shutil, re, subprocess
from pathlib import Path
source=Path('next-app');site=Path('site')
# Keep the previous public icons and assets, then overlay the complete new build.
shutil.copytree('public',site,dirs_exist_ok=True)
shutil.copytree(source/'reception-app/dist',site,dirs_exist_ok=True)
shutil.copytree(source/'management-app/dist',site/'control',dirs_exist_ok=True)
for folder,base,title,app in [(site,'/qr-system/','QR受付','reception'),(site/'control','/qr-system/control/','QR管理','management')]:
 # Keep the reviewed application source pinned; update branding at publication.
 shutil.copytree(Path('deployment/app-icons')/app,folder/'icons',dirs_exist_ok=True)
 icon=f'icons/{app}-v1'
 manifest={'id':base,'name':title,'short_name':title,'lang':'ja','start_url':base,'scope':base,'display':'standalone','background_color':'#7048eb','theme_color':'#7048eb'}
 manifest['icons']=[{'src':f'{icon}-{size}.png','sizes':f'{size}x{size}','type':'image/png','purpose':'any'} for size in (192,512)]
 (folder/'manifest.webmanifest').write_text(json.dumps(manifest,ensure_ascii=False))
 html=(folder/'index.html').read_text()
 html=re.sub(r'<link\b(?=[^>]*\brel=["\'](?:icon|apple-touch-icon|manifest)["\'])[^>]*>','',html,flags=re.I)
 html=re.sub(r'<meta\b(?=[^>]*\bname=["\'](?:theme-color|apple-mobile-web-app-capable|apple-mobile-web-app-title)["\'])[^>]*>','',html,flags=re.I)
 links='<link rel="manifest" href="./manifest.webmanifest"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="theme-color" content="#7048eb">'
 links+=f'<meta name="apple-mobile-web-app-title" content="{title}"><link rel="icon" type="image/png" sizes="32x32" href="./{icon}-32.png"><link rel="apple-touch-icon" sizes="180x180" href="./{icon}-180.png">'
 (folder/'index.html').write_text(html.replace('</head>',links+'</head>'))
 assert '/QR-Ticket-System/' not in html
 for path in re.findall(r'(?:src|href)=["\']([^"\']+)["\']',html):
  if path.startswith(base):assert (folder/path[len(base):]).is_file(),path
 for name in ['index.html','sw.js','manifest.webmanifest']:assert (folder/name).is_file()
 for size in (32,180,192,512):assert (folder/f'{icon}-{size}.png').is_file()
 # Refresh existing installed app shells without touching offline visitor data.
 worker=folder/'sw.js'
 worker.write_text(re.sub(r"(const CACHE(?:_PREFIX)?\s*=\s*['\"])([^'\"]+)(['\"])",lambda m:m[1]+m[2]+'-icons-v1'+m[3],worker.read_text(),count=1))
assert (site/'control/offline-assets.json').is_file()
for path in json.loads((site/'control/offline-assets.json').read_text()):assert (site/'control'/path).is_file()
(site/'deployment.json').write_text(json.dumps({'sourceRepository':'1453manamana5-web/QR-Ticket-System','sourceCommit':subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip(),'firebaseProject':'qr-ticket-system-5ba69','receptionBase':'/qr-system/','managementBase':'/qr-system/control/'}))
print('Verified both legacy URL entry points, built assets, manifests and offline files.')
