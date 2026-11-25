require('dotenv').config();
const path = require('node:path');
const express = require('express');
const { Store } = require('./src/store');
const { createAuth } = require('./src/auth');
const { createBookingProvider } = require('./src/providers/bookings');
const { searchPlaces } = require('./src/providers/places');

const app = express();
const store = new Store(path.join(__dirname, 'data', 'demo.json'));
const auth = createAuth();
const bookings = createBookingProvider();
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline' https://unpkg.com; script-src 'self' https://unpkg.com; img-src 'self' data: https://*.tile.openstreetmap.org https://images.unsplash.com; connect-src 'self' https://*.supabase.co https://api.openai.com; font-src 'self' data:; frame-ancestors 'none'");
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
app.get('/api/health', (req,res) => res.json({ ok:true, mode: process.env.AUTH_MODE || 'demo' }));
app.post('/api/auth/login', asyncRoute(async (req,res) => res.json(await auth.login(req.body))));
app.post('/api/auth/register', asyncRoute(async (req,res) => res.json(await auth.register(req.body))));
app.post('/api/auth/logout', (req,res) => res.json({ ok:true }));
app.get('/api/auth/me', auth.requireUser, (req,res) => res.json({ user:req.user }));
app.get('/api/destinations', asyncRoute(async (req,res) => res.json(await store.catalog('destinations'))));
app.get('/api/hotels', asyncRoute(async (req,res) => {
  const q = String(req.query.destination || '').toLowerCase();
  res.json(await store.catalog('hotels',q));
}));
app.get('/api/attractions', asyncRoute(async (req,res) => {
  const q = String(req.query.destination || '').toLowerCase();
  res.json(await store.catalog('attractions',q));
}));
const placeCache=new Map();
app.get('/api/places/search', asyncRoute(async (req,res) => {
  const query=String(req.query.q||'').trim().slice(0,100);
  if(query.length<2)return res.status(400).json({error:'Enter a city or place name.'});
  const key=query.toLowerCase();const cached=placeCache.get(key);
  if(cached&&cached.expires>Date.now())return res.json(cached.data);
  const data=await searchPlaces(query,store);
  placeCache.set(key,{data,expires:Date.now()+30*60*1000});
  if(placeCache.size>50)placeCache.delete(placeCache.keys().next().value);
  res.json(data);
}));
app.get('/api/itinerary', auth.requireUser, asyncRoute(async (req,res) => res.json(await store.userList('itineraries',req.user.id))));
app.post('/api/itinerary', auth.requireUser, asyncRoute(async (req,res) => {
  const { title, destination, date, notes='' } = req.body || {};
  if (![title,destination,date].every(v => typeof v === 'string' && v.trim()) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({error:'Add a title, destination and valid date.'});
  const item = { id:store.id(), userId:req.user.id, title:title.trim().slice(0,80), destination:destination.trim().slice(0,80), date, notes:String(notes).slice(0,500) };
  await store.add('itineraries',item); res.status(201).json(item);
}));
app.get('/api/expenses', auth.requireUser, asyncRoute(async (req,res) => res.json(await store.userList('expenses',req.user.id))));
app.post('/api/expenses', auth.requireUser, asyncRoute(async (req,res) => {
  const { title, amount, category='Other', date=new Date().toISOString().slice(0,10) } = req.body || {};
  if (!title || !Number.isFinite(Number(amount)) || Number(amount) <= 0 || Number(amount) > 10000000) return res.status(400).json({error:'Enter a description and positive amount.'});
  const item = { id:store.id(),userId:req.user.id,title:String(title).trim().slice(0,80),amount:Number(amount),category:String(category).slice(0,40),date:String(date).slice(0,10) };
  await store.add('expenses',item); res.status(201).json(item);
}));
app.get('/api/bookings', auth.requireUser, asyncRoute(async (req,res) => res.json(await store.userList('bookings',req.user.id))));
app.post('/api/bookings', auth.requireUser, asyncRoute(async (req,res) => {
  const { hotelId, checkIn, checkOut, guests=1 } = req.body || {};
  const hotel = (await store.catalog('hotels')).find(h => h.id === hotelId);
  if (!hotel || !/^\d{4}-\d{2}-\d{2}$/.test(checkIn || '') || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut || '') || checkOut <= checkIn || !Number.isInteger(Number(guests)) || guests < 1 || guests > 12) return res.status(400).json({error:'Choose a hotel, valid dates and 1–12 guests.'});
  const created = await bookings.create({ hotel, checkIn, checkOut, guests:Number(guests), userId:req.user.id });
  const item={ id:store.id(),userId:req.user.id,hotelId:hotel.id,hotelName:hotel.name,destination:hotel.destination,checkIn,checkOut,guests:Number(guests),status:'demo-confirmed',provider:created.provider,reference:store.id().slice(0,8).toUpperCase(),total:hotel.pricePerNight*guests, currency:hotel.currency };
  await store.add('bookings',item); res.status(201).json(item);
}));
const weatherCache=new Map();
const weatherDescription=code=>({
  0:'Clear',1:'Mostly clear',2:'Partly cloudy',3:'Overcast',
  45:'Fog',48:'Rime fog',51:'Light drizzle',53:'Drizzle',55:'Heavy drizzle',
  56:'Freezing drizzle',57:'Heavy freezing drizzle',61:'Light rain',63:'Rain',65:'Heavy rain',
  66:'Freezing rain',67:'Heavy freezing rain',71:'Light snow',73:'Snow',75:'Heavy snow',
  77:'Snow grains',80:'Light showers',81:'Rain showers',82:'Heavy showers',
  85:'Snow showers',86:'Heavy snow showers',95:'Thunderstorm',96:'Thunderstorm with hail',99:'Thunderstorm with heavy hail'
}[code]||'Current conditions');
app.get('/api/weather', asyncRoute(async (req,res) => {
  const destination=String(req.query.destination||'').trim().slice(0,80);
  if(!destination)return res.status(400).json({error:'Choose a destination.'});
  const rawLat=String(req.query.lat??'').trim(),rawLng=String(req.query.lng??'').trim();
  let lat=rawLat?Number(rawLat):NaN,lng=rawLng?Number(rawLng):NaN;
  const hasCoordinates=Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180;
  if(!hasCoordinates){
    const geocode=new URL('https://geocoding-api.open-meteo.com/v1/search');
    geocode.searchParams.set('name',destination);geocode.searchParams.set('count','1');geocode.searchParams.set('language','en');geocode.searchParams.set('format','json');
    const lookup=await fetch(geocode,{signal:AbortSignal.timeout(8000)});
    if(!lookup.ok)throw new Error('Weather location lookup failed');
    const found=(await lookup.json()).results?.[0];
    if(!found)return res.status(404).json({error:'Could not find that location for weather.'});
    lat=found.latitude;lng=found.longitude;
  }
  const cacheKey=`${lat.toFixed(3)},${lng.toFixed(3)}`,cached=weatherCache.get(cacheKey);
  if(cached&&cached.expires>Date.now())return res.json({...cached.data,destination});
  const forecast=new URL('https://api.open-meteo.com/v1/forecast');
  forecast.searchParams.set('latitude',String(lat));forecast.searchParams.set('longitude',String(lng));
  forecast.searchParams.set('current','temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m');
  forecast.searchParams.set('timezone','auto');
  const response=await fetch(forecast,{signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw new Error('Weather service request failed');
  const data=await response.json(),current=data.current;
  if(!current)throw new Error('Weather service returned no current conditions');
  const result={source:'open-meteo',destination,condition:weatherDescription(current.weather_code),temperature:Math.round(current.temperature_2m),feelsLike:Math.round(current.apparent_temperature),humidity:current.relative_humidity_2m,windSpeed:current.wind_speed_10m,time:current.time,timezone:data.timezone,attribution:'Weather data by Open-Meteo'};
  weatherCache.set(cacheKey,{data:result,expires:Date.now()+15*60*1000});
  if(weatherCache.size>100)weatherCache.delete(weatherCache.keys().next().value);
  res.json(result);
}));
app.post('/api/assistant', auth.requireUser, asyncRoute(async (req,res) => {
  const prompt=String(req.body?.message || '').trim();
  if (!prompt || prompt.length > 1200) return res.status(400).json({error:'Enter a message up to 1,200 characters.'});
  if (!process.env.AI_API_KEY) return res.json({mode:'setup',reply:'The TripMate assistant is ready to connect. Add AI_API_KEY and AI_MODEL to the server .env file to enable AI responses. Your key stays on the server.'});
  const endpoint=process.env.AI_PROVIDER_URL || 'https://api.openai.com/v1/chat/completions';
  const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.AI_API_KEY}`},body:JSON.stringify({model:process.env.AI_MODEL||'gpt-4o-mini',messages:[{role:'system',content:'You are TripMate, a concise travel planning assistant. Give practical suggestions, identify estimates as estimates, and never claim to book real inventory.'},{role:'user',content:prompt}]}),signal:AbortSignal.timeout(20000)});
  if (!r.ok) throw new Error(`AI provider returned HTTP ${r.status}`);
  const data=await r.json(); res.json({mode:'ai',reply:data.choices?.[0]?.message?.content || 'No response was returned.'});
}));
const adminKinds=new Set(['destinations','hotels','attractions']);
const slugify=s=>String(s||'place').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,45)||'place';
app.get('/api/admin/users',auth.requireUser,auth.requireAdmin,asyncRoute(async(req,res)=>res.json(await auth.listUsers())));
app.put('/api/admin/users/:id/role',auth.requireUser,auth.requireAdmin,asyncRoute(async(req,res)=>res.json(await auth.setUserRole(req.params.id,String(req.body?.role||'')))));
app.get('/api/admin/bookings',auth.requireUser,auth.requireAdmin,asyncRoute(async(req,res)=>res.json(await store.adminBookings())));
app.get('/api/admin/catalog/:kind',auth.requireUser,auth.requireAdmin,asyncRoute(async(req,res)=>{if(!adminKinds.has(req.params.kind))return res.status(404).json({error:'Unknown catalog.'});res.json(await store.catalog(req.params.kind))}));
app.post('/api/admin/catalog/:kind',auth.requireUser,auth.requireAdmin,asyncRoute(async(req,res)=>{
 const {kind}=req.params,b=req.body||{};if(!adminKinds.has(kind))return res.status(404).json({error:'Unknown catalog.'});
 const name=String(b.name||'').trim().slice(0,100),destination=String(b.destination||'').trim().slice(0,80);
 const lat=Number(b.lat),lng=Number(b.lng);if(!name||!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)return res.status(400).json({error:'Enter a name and valid map coordinates.'});
 const id=`${slugify(name)}-${store.id().slice(0,6)}`;let item;
 if(kind==='destinations'){const country=String(b.country||'').trim().slice(0,80),tagline=String(b.tagline||'').trim().slice(0,120);if(!country||!tagline)return res.status(400).json({error:'Add the country and a short tagline.'});item={id,name,country,tagline,lat,lng,image:String(b.image||'').slice(0,500),description:String(b.description||'').slice(0,500)};}
 else if(kind==='hotels'){const area=String(b.area||'').trim().slice(0,100),pricePerNight=Number(b.pricePerNight),rating=Number(b.rating||0);if(!destination||!area||!Number.isFinite(pricePerNight)||pricePerNight<=0||!Number.isFinite(rating)||rating<0||rating>5)return res.status(400).json({error:'Add a destination, area, positive nightly price and rating from 0 to 5.'});item={id,name,destination,area,pricePerNight,rating,currency:'INR',lat,lng,description:String(b.description||'').slice(0,500)};}
 else{const category=String(b.category||'').trim().slice(0,80);if(!destination||!category)return res.status(400).json({error:'Add a destination and category.'});item={id,name,destination,category,lat,lng};}
 await store.adminCreate(kind,item);res.status(201).json(item);
}));
app.delete('/api/admin/catalog/:kind/:id',auth.requireUser,auth.requireAdmin,asyncRoute(async(req,res)=>{if(!adminKinds.has(req.params.kind))return res.status(404).json({error:'Unknown catalog.'});const ok=await store.adminDelete(req.params.kind,req.params.id);res.status(ok?200:404).json(ok?{ok:true}:{error:'Record not found.'})}));
app.get('/api/admin/summary', auth.requireUser, auth.requireAdmin, asyncRoute(async (req,res) => res.json({users:(await auth.listUsers()).length,bookings:(await store.adminBookings()).length,destinations:(await store.catalog('destinations')).length,hotels:(await store.catalog('hotels')).length})));
app.get(/.*/, (req,res,next) => req.path.startsWith('/api/') ? next() : res.sendFile(path.join(__dirname,'public','index.html')));
app.use((err,req,res,next) => { console.error(err.message); res.status(err.status || 500).json({error:err.status && err.status < 500 ? err.message : 'Something went wrong. Check the server log.'}); });

const port=Number(process.env.PORT)||5000;
app.listen(port,()=>console.log(`TripMate running at http://localhost:${port}`));
