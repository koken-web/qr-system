import json, shutil, re, subprocess
from pathlib import Path
source=Path('next-app');site=Path('site')
# Keep the previous public icons and assets, then overlay the complete new build.
shutil.copytree('public',site,dirs_exist_ok=True)
shutil.copytree(source/'reception-app/dist',site,dirs_exist_ok=True)
shutil.copytree(source/'management-app/dist',site/'control',dirs_exist_ok=True)
icon=Path('control-app/public/control-icon.svg')
if icon.exists():shutil.copy2(icon,site/'control/control-icon.svg')
for folder,base,title,icon in [(site,'/qr-system/','QR受付','pwa-192x192.png'),(site/'control','/qr-system/control/','QR管理','control-icon.svg')]:
 manifest={'id':base,'name':title,'short_name':title,'lang':'ja','start_url':base,'scope':base,'display':'standalone','background_color':'#f5f7fa','theme_color':'#172033'}
 if (folder/icon).exists():manifest['icons']=[{'src':icon,'sizes':'any' if icon.endswith('.svg') else '192x192','type':'image/svg+xml' if icon.endswith('.svg') else 'image/png'}]
 (folder/'manifest.webmanifest').write_text(json.dumps(manifest,ensure_ascii=False))
 html=(folder/'index.html').read_text()
 links='<link rel="manifest" href="./manifest.webmanifest"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="theme-color" content="#172033">'
 if (folder/icon).exists():links+='<link rel="apple-touch-icon" href="./'+icon+'">'
 (folder/'index.html').write_text(html.replace('</head>',links+'</head>'))
 assert '/QR-Ticket-System/' not in html
 for path in re.findall(r'(?:src|href)=["\']([^"\']+)["\']',html):
  if path.startswith(base):assert (folder/path[len(base):]).is_file(),path
 for name in ['index.html','sw.js','manifest.webmanifest']:assert (folder/name).is_file()
assert (site/'control/offline-assets.json').is_file()
for path in json.loads((site/'control/offline-assets.json').read_text()):assert (site/'control'/path).is_file()
(site/'deployment.json').write_text(json.dumps({'sourceRepository':'1453manamana5-web/QR-Ticket-System','sourceCommit':subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip(),'firebaseProject':'qr-ticket-system-5ba69','receptionBase':'/qr-system/','managementBase':'/qr-system/control/'}))
print('Verified both legacy URL entry points, built assets, manifests and offline files.')
