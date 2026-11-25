const ttl=20_000;
function suggestions(location,attractions,hotels){
  const ideas=[];
  if(attractions[0])ideas.push(`Start your day at ${attractions[0].name}, then explore the nearby area on foot.`);
  if(attractions.length>1)ideas.push(`Pair ${attractions[0].name} with ${attractions[1].name} for a simple sightseeing day.`);
  if(hotels.length)ideas.push(`Compare stays around ${hotels[0].area||location.name}; check recent reviews, rates and availability before booking.`);
  if(!ideas.length)ideas.push(`Try searching for a nearby district or a more specific spelling for ${location.name}.`);
  return ideas;
}
function sampleResult(query,store){
  const d=store.destinations.find(x=>x.name.toLowerCase()===query.toLowerCase()||x.name.toLowerCase().includes(query.toLowerCase()));
  if(!d)return {source:'sample',configured:false,query,message:'Live location search is not connected yet. Add a Geoapify API key to .env to search cities outside the included sample destinations.'};
  const attractions=store.attractions.filter(x=>x.destination===d.name).map(x=>({...x,address:d.name}));
  const hotels=store.hotels.filter(x=>x.destination===d.name).map(x=>({id:x.id,name:x.name,destination:x.destination,area:x.area,lat:x.lat,lng:x.lng,address:`${x.area}, ${x.destination}`,category:'Hotel listing'}));
  return {source:'sample',configured:false,location:{name:d.name,country:d.country,lat:d.lat,lng:d.lng},attractions,hotels,suggestions:suggestions(d,attractions,hotels),message:'Showing included sample listings. Add a Geoapify API key for live search in other locations.'};
}
async function fetchJson(url){
  const response=await fetch(url,{headers:{'User-Agent':'TripMateLocal/1.0 (local travel planner)'},signal:AbortSignal.timeout(ttl)});
  if(!response.ok)throw new Error(`Location search provider returned HTTP ${response.status}. Try again in a moment.`);
  return response.json();
}
async function searchPlaces(query,store){
  const apiKey=process.env.GEOAPIFY_API_KEY;
  if(!apiKey)return sampleResult(query,store);
  const geoUrl=new URL('https://api.geoapify.com/v1/geocode/search');
  geoUrl.searchParams.set('text',query);geoUrl.searchParams.set('format','json');geoUrl.searchParams.set('limit','1');geoUrl.searchParams.set('apiKey',apiKey);
  const geo=await fetchJson(geoUrl);const hit=geo.results?.[0];
  if(!hit)return {source:'geoapify',configured:true,query,message:`No location matched “${query}”. Try adding a region or country.`};
  const location={name:hit.city||hit.name||query,country:hit.country||'',lat:Number(hit.lat),lng:Number(hit.lon)};
  const radius=Math.min(Math.max(Number(process.env.GEOAPIFY_SEARCH_RADIUS_METERS)||8000,1000),25000);
  const placesUrl=new URL('https://api.geoapify.com/v2/places');
  placesUrl.searchParams.set('categories','tourism,accommodation');
  placesUrl.searchParams.set('filter',`circle:${location.lng},${location.lat},${radius}`);
  placesUrl.searchParams.set('bias',`proximity:${location.lng},${location.lat}`);
  placesUrl.searchParams.set('limit','40');placesUrl.searchParams.set('apiKey',apiKey);
  const places=await fetchJson(placesUrl);
  const mapped=(places.features||[]).map((feature,index)=>{
    const p=feature.properties||{};const coords=feature.geometry?.coordinates||[];
    const lat=Number(p.lat??coords[1]),lng=Number(p.lon??coords[0]);
    const categories=Array.isArray(p.categories)?p.categories:[];
    return {id:p.place_id||`${lat},${lng},${index}`,name:p.name||categories.at(-1)?.split('.').at(-1)?.replaceAll('_',' ')||'Nearby place',destination:location.name,category:categories.find(c=>c.startsWith('tourism'))||categories.find(c=>c.startsWith('accommodation'))||categories.at(-1)||'Place',area:p.address_line2||p.suburb||p.district||location.name,address:p.formatted||'',lat,lng,distance:Number.isFinite(Number(p.distance))?Number(p.distance):null,categories};
  }).filter(x=>Number.isFinite(x.lat)&&Number.isFinite(x.lng));
  const hotels=mapped.filter(p=>p.categories.some(c=>c.startsWith('accommodation')));
  const attractions=mapped.filter(p=>p.categories.some(c=>c.startsWith('tourism'))&&!p.categories.some(c=>c.startsWith('accommodation')));
  return {source:'geoapify',configured:true,location,attractions:attractions.slice(0,20),hotels:hotels.slice(0,20),suggestions:suggestions(location,attractions,hotels),radiusMeters:radius,attribution:'Places data © OpenStreetMap contributors · Geoapify'};
}
module.exports={searchPlaces};
