const crypto = require('node:crypto');
const users = new Map();
const secret = () => process.env.SESSION_SECRET || 'local-demo-only-change-me';
const tokenFor = payload => { const raw=Buffer.from(JSON.stringify({...payload,exp:Date.now()+86400000})).toString('base64url'); return `${raw}.${crypto.createHmac('sha256',secret()).update(raw).digest('base64url')}`; };
const checkToken = token => { try { const [raw,sig]=token.split('.'); const expected=crypto.createHmac('sha256',secret()).update(raw).digest(); const actual=Buffer.from(sig,'base64url'); if (actual.length!==expected.length || !crypto.timingSafeEqual(actual,expected)) return null; const data=JSON.parse(Buffer.from(raw,'base64url')); return data.exp>Date.now()?data:null; } catch { return null; } };
const safeUser = u => ({id:u.id,email:u.email,role:u.role,name:u.name});
function createAuth() {
  const demo=()=> (process.env.AUTH_MODE || 'demo').toLowerCase() === 'demo';
  async function supabaseUser(req) {
    const { createClient }=require('@supabase/supabase-js');
    const client=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_ANON_KEY,{auth:{persistSession:false}});
    const {data,error}=await client.auth.getUser(req.token); if(error || !data.user) return null;
    let role='user';
    if(process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
      const {data:profile}=await admin.from('profiles').select('role').eq('id',data.user.id).maybeSingle(); role=profile?.role==='admin'?'admin':'user';
    }
    return {id:data.user.id,email:data.user.email,role,name:data.user.user_metadata?.name||data.user.email};
  }
  async function requireUser(req,res,next) {
    const header=req.headers.authorization||''; req.token=header.startsWith('Bearer ')?header.slice(7):'';
    if(!req.token) return res.status(401).json({error:'Sign in to continue.'});
    if(demo()) { const u=checkToken(req.token); if(!u) return res.status(401).json({error:'Session expired. Sign in again.'}); req.user=u; return next(); }
    if(!process.env.SUPABASE_URL||!process.env.SUPABASE_ANON_KEY) return res.status(503).json({error:'Supabase credentials are missing.'});
    try { req.user=await supabaseUser(req); if(!req.user) return res.status(401).json({error:'Session invalid or expired.'}); next(); } catch { res.status(401).json({error:'Session verification failed.'}); }
  }
  return {
    requireUser,
    requireAdmin:(req,res,next)=>req.user?.role==='admin'?next():res.status(403).json({error:'Administrator access required.'}),
    userCount:()=>users.size,
    listUsers:async()=>{
      if(demo())return [...users.values()].map(safeUser);
      if(!process.env.SUPABASE_SERVICE_ROLE_KEY)return [];
      const {createClient}=require('@supabase/supabase-js');const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
      const out=[];for(let page=1;page<=20;page++){const {data,error}=await admin.auth.admin.listUsers({page,perPage:100});if(error)throw error;const batch=data.users||[];out.push(...batch);if(batch.length<100)break;}
      const roles=new Map();if(out.length){const {data}=await admin.from('profiles').select('id,role').in('id',out.map(u=>u.id));for(const p of data||[])roles.set(p.id,p.role);}
      return out.map(u=>({id:u.id,email:u.email||'',name:u.user_metadata?.name||'',role:roles.get(u.id)==='admin'?'admin':'user',createdAt:u.created_at,confirmed:!!u.email_confirmed_at}));
    },
    setUserRole:async(userId,role)=>{
      if(!['user','admin'].includes(role))throw Object.assign(new Error('Role must be user or admin.'),{status:400});
      if(demo()){const u=users.get(userId);if(!u)throw Object.assign(new Error('Account not found.'),{status:404});u.role=role;return safeUser(u);}
      if(!process.env.SUPABASE_SERVICE_ROLE_KEY)throw Object.assign(new Error('The Supabase server secret is required for role management.'),{status:503});
      const {createClient}=require('@supabase/supabase-js');const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
      const {data,error}=await admin.from('profiles').update({role}).eq('id',userId).select('id,role').maybeSingle();if(error)throw error;if(!data)throw Object.assign(new Error('Account profile not found.'),{status:404});return {id:data.id,role:data.role};
    },
    login:async ({email,password}={})=>{
      email=String(email||'').trim().toLowerCase(); password=String(password||'');
      if(demo()) {
        if(email===(process.env.ADMIN_EMAIL||'admin@tripmate.local').toLowerCase() && password===(process.env.ADMIN_PASSWORD||'ChangeThisAdminPassword123!')) { const u={id:'demo-admin',email,role:'admin',name:'TripMate Admin'}; users.set(u.id,u); return {accessToken:tokenFor(u),user:safeUser(u)}; }
        if(password.length<6) throw Object.assign(new Error('Password must contain at least 6 characters.'),{status:400});
        let u=[...users.values()].find(x=>x.email===email); if(!u) { const id=crypto.createHmac('sha256',secret()).update(`user:${email}`).digest('hex').slice(0,32);u={id,email,role:'user',name:email.split('@')[0]}; users.set(u.id,u); }
        return {accessToken:tokenFor(u),user:safeUser(u)};
      }
      const {createClient}=require('@supabase/supabase-js'); const c=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_ANON_KEY,{auth:{persistSession:false}});
      const {data,error}=await c.auth.signInWithPassword({email,password}); if(error) throw Object.assign(new Error(error.message),{status:401}); return {accessToken:data.session.access_token,user:{id:data.user.id,email:data.user.email,name:data.user.user_metadata?.name||email,role:'user'}};
    },
    register:async ({email,password,name}={})=>{
      email=String(email||'').trim().toLowerCase(); password=String(password||''); name=String(name||'').trim().slice(0,80);
      if(!/^\S+@\S+\.\S+$/.test(email)||password.length<8||!name) throw Object.assign(new Error('Enter a valid email, name and password (8+ characters).'),{status:400});
      if(demo()) { if([...users.values()].some(u=>u.email===email)) throw Object.assign(new Error('An account with that email already exists.'),{status:409}); const id=crypto.createHmac('sha256',secret()).update(`user:${email}`).digest('hex').slice(0,32);const u={id,email,name,role:'user'};users.set(u.id,u);return {accessToken:tokenFor(u),user:safeUser(u)}; }
      const {createClient}=require('@supabase/supabase-js'); const c=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_ANON_KEY,{auth:{persistSession:false}});
      const {data,error}=await c.auth.signUp({email,password,options:{data:{name}}}); if(error) throw Object.assign(new Error(error.message),{status:400}); if(!data.session) return {needsEmailConfirmation:true,message:'Check your email to confirm your account before signing in.'}; return {accessToken:data.session.access_token,user:{id:data.user.id,email:data.user.email,name,role:'user'}};
    }
  };
}
module.exports={createAuth};
