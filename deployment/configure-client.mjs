import fs from 'node:fs';
const config=JSON.parse(fs.readFileSync('deployment/firebase-client.json','utf8'));
if(config.projectId!=='qr-ticket-system-5ba69')throw Error('Refusing to connect new UI to legacy Firebase schema');
const fields={apiKey:'API_KEY',authDomain:'AUTH_DOMAIN',projectId:'PROJECT_ID',storageBucket:'STORAGE_BUCKET',messagingSenderId:'MESSAGING_SENDER_ID',appId:'APP_ID'};
const env=Object.entries(fields).map(([key,name])=>{
 if(typeof config[key]!=='string'||!config[key]||/[\r\n]/.test(config[key]))throw Error('Invalid public Firebase setting: '+key);
 return 'VITE_FIREBASE_'+name+'='+config[key];
}).join('\n')+'\n';
for(const app of ['reception-app','management-app'])fs.writeFileSync('next-app/'+app+'/.env.production',env);
