const fs=require('node:fs'); const crypto=require('node:crypto');
const seed={
 destinations:[
  {id:'jaipur',name:'Jaipur',country:'India',tagline:'Palaces, pink sandstone and lively bazaars',lat:26.9124,lng:75.7873,weather:'Sunny',temperature:31,image:'https://images.unsplash.com/photo-1599661046827-dacff0c0f09a?auto=format&fit=crop&w=1000&q=85',description:'Explore the forts, courtyards and craft markets of Rajasthan’s Pink City.'},
  {id:'kyoto',name:'Kyoto',country:'Japan',tagline:'Quiet temples and timeless streets',lat:35.0116,lng:135.7681,weather:'Mild',temperature:19,image:'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=1000&q=85',description:'Walk temple paths, historic lanes and peaceful gardens.'},
  {id:'lisbon',name:'Lisbon',country:'Portugal',tagline:'Coastal light, tiled lanes and great food',lat:38.7223,lng:-9.1393,weather:'Clear',temperature:23,image:'https://images.unsplash.com/photo-1555881400-74d7acaacd8b?auto=format&fit=crop&w=1000&q=85',description:'Ride the trams, discover viewpoints and enjoy the Atlantic coast.'}
 ],
 hotels:[
  {id:'h-jaipur-1',name:'Hawa Mahal House',destination:'Jaipur',area:'Old City',rating:4.8,pricePerNight:4200,currency:'INR',lat:26.9239,lng:75.8267,description:'Boutique stay near Jaipur’s historic bazaars.'},
  {id:'h-jaipur-2',name:'Amber Garden Stay',destination:'Jaipur',area:'Amer',rating:4.6,pricePerNight:3600,currency:'INR',lat:26.9855,lng:75.8513,description:'Relaxed courtyard stay close to Amber Fort.'},
  {id:'h-kyoto-1',name:'Gion Lane Inn',destination:'Kyoto',area:'Gion',rating:4.9,pricePerNight:12500,currency:'INR',lat:35.0037,lng:135.7788,description:'Small design-led inn in the heart of Gion.'},
  {id:'h-kyoto-2',name:'Higashiyama Garden',destination:'Kyoto',area:'Higashiyama',rating:4.7,pricePerNight:9800,currency:'INR',lat:34.9972,lng:135.7808,description:'Quiet guesthouse beside temple walks.'},
  {id:'h-lisbon-1',name:'Alfama View Rooms',destination:'Lisbon',area:'Alfama',rating:4.7,pricePerNight:8500,currency:'INR',lat:38.711,lng:-9.129,description:'Sunny rooms in Lisbon’s old quarter.'},
  {id:'h-lisbon-2',name:'Bairro Alto House',destination:'Lisbon',area:'Bairro Alto',rating:4.5,pricePerNight:7900,currency:'INR',lat:38.713,lng:-9.144,description:'Modern stay close to cafés, viewpoints and trams.'}
 ],
 attractions:[
  {id:'a-j1',name:'Hawa Mahal',destination:'Jaipur',category:'Landmark',lat:26.9239,lng:75.8267}, {id:'a-j2',name:'Amber Fort',destination:'Jaipur',category:'Historic site',lat:27.1795,lng:75.8398}, {id:'a-j3',name:'City Palace',destination:'Jaipur',category:'Museum',lat:26.9258,lng:75.8237},
  {id:'a-k1',name:'Fushimi Inari Taisha',destination:'Kyoto',category:'Shrine',lat:34.9671,lng:135.7727}, {id:'a-k2',name:'Kiyomizu-dera',destination:'Kyoto',category:'Temple',lat:34.9949,lng:135.785}, {id:'a-k3',name:'Arashiyama Bamboo Grove',destination:'Kyoto',category:'Nature',lat:35.017,lng:135.671},
  {id:'a-l1',name:'Belém Tower',destination:'Lisbon',category:'Landmark',lat:38.6916,lng:-9.216}, {id:'a-l2',name:'São Jorge Castle',destination:'Lisbon',category:'Historic site',lat:38.7139,lng:-9.1335}, {id:'a-l3',name:'Praça do Comércio',destination:'Lisbon',category:'Square',lat:38.7076,lng:-9.1365}
 ],itineraries:[],expenses:[],bookings:[]
};
class Store {
 constructor(file){this.file=file;let saved={};try{saved=JSON.parse(fs.readFileSync(file,'utf8'));}catch{};this.data={...seed,...saved};for(const key of Object.keys(this.data)) if(!Array.isArray(this.data[key])) this.data[key]=[];this.db=null;
  if(process.env.AUTH_MODE==='supabase'&&process.env.SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY){const {createClient}=require('@supabase/supabase-js');this.db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});}
 }
 get destinations(){return this.data.destinations} get hotels(){return this.data.hotels} get attractions(){return this.data.attractions} get bookings(){return this.data.bookings}
 id(){return crypto.randomUUID()}
 async catalog(key,destination=''){
  if(!this.db)return this.data[key].filter(x=>!destination||x.destination.toLowerCase()===destination.toLowerCase());
  const table={destinations:'destinations',hotels:'hotels',attractions:'attractions'}[key];let q=this.db.from(table).select('*');if(destination)q=q.ilike('destination',destination);const {data,error}=await q;if(error)throw error;
  return data.map(x=>key==='destinations'?{id:x.id,name:x.name,country:x.country,tagline:x.tagline,lat:x.latitude,lng:x.longitude,image:x.image_url,description:x.description,weather:'—',temperature:'—'}:key==='hotels'?{id:x.id,name:x.name,destination:x.destination,area:x.area,rating:Number(x.rating),pricePerNight:Number(x.price_per_night),currency:x.currency,lat:x.latitude,lng:x.longitude,description:x.description}: {id:x.id,name:x.name,destination:x.destination,category:x.category,lat:x.latitude,lng:x.longitude});
 }
 async userList(key,userId){
  if(!this.db)return this.data[key].filter(x=>x.userId===userId);
  const {data,error}=await this.db.from(key).select('*').eq('user_id',userId).order('created_at',{ascending:false});if(error)throw error;
  return data.map(x=>key==='itineraries'?{id:x.id,userId:x.user_id,title:x.title,destination:x.destination,date:x.trip_date,notes:x.notes}:key==='expenses'?{id:x.id,userId:x.user_id,title:x.title,amount:Number(x.amount),category:x.category,date:x.expense_date}:{id:x.id,userId:x.user_id,hotelId:x.hotel_id,hotelName:this.data.hotels.find(h=>h.id===x.hotel_id)?.name||x.hotel_id,destination:this.data.hotels.find(h=>h.id===x.hotel_id)?.destination||'',checkIn:x.check_in,checkOut:x.check_out,guests:x.guests,status:x.status,provider:x.provider,reference:x.reference,total:Number(x.total),currency:x.currency});
 }
 async adminBookings(){
  if(!this.db)return this.data.bookings;
  const hotels=await this.catalog('hotels');
  const {data,error}=await this.db.from('bookings').select('*').order('created_at',{ascending:false});if(error)throw error;
  return data.map(x=>{const h=hotels.find(y=>y.id===x.hotel_id);return{id:x.id,userId:x.user_id,hotelId:x.hotel_id,hotelName:h?.name||x.hotel_id,destination:h?.destination||'',checkIn:x.check_in,checkOut:x.check_out,guests:x.guests,status:x.status,provider:x.provider,reference:x.reference,total:Number(x.total),currency:x.currency}});
 }
 async adminCreate(kind,item){
  if(!this.db){this.data[kind].push(item);fs.mkdirSync(require('node:path').dirname(this.file),{recursive:true});fs.writeFileSync(this.file,JSON.stringify(this.data,null,2),'utf8');return item;}
  let row;
  if(kind==='destinations')row={id:item.id,name:item.name,country:item.country,tagline:item.tagline,latitude:item.lat,longitude:item.lng,image_url:item.image||'',description:item.description||''};
  else if(kind==='hotels')row={id:item.id,name:item.name,destination:item.destination,area:item.area,rating:item.rating,price_per_night:item.pricePerNight,currency:item.currency,latitude:item.lat,longitude:item.lng,description:item.description||'',provider:'demo'};
  else row={id:item.id,name:item.name,destination:item.destination,category:item.category,latitude:item.lat,longitude:item.lng};
  const {error}=await this.db.from(kind).insert(row);if(error)throw error;return item;
 }
 async adminDelete(kind,id){
  if(!this.db){const before=this.data[kind].length;this.data[kind]=this.data[kind].filter(x=>x.id!==id);if(before===this.data[kind].length)return false;fs.mkdirSync(require('node:path').dirname(this.file),{recursive:true});fs.writeFileSync(this.file,JSON.stringify(this.data,null,2),'utf8');return true;}
  const {data,error}=await this.db.from(kind).delete().eq('id',id).select('id');if(error)throw error;return data.length>0;
 }
 async add(key,item){
  if(this.db){let row=key==='itineraries'?{id:item.id,user_id:item.userId,title:item.title,destination:item.destination,trip_date:item.date,notes:item.notes}:key==='expenses'?{id:item.id,user_id:item.userId,title:item.title,amount:item.amount,category:item.category,expense_date:item.date}:{id:item.id,user_id:item.userId,hotel_id:item.hotelId,check_in:item.checkIn,check_out:item.checkOut,guests:item.guests,status:item.status,provider:item.provider,reference:item.reference,total:item.total,currency:item.currency};const {error}=await this.db.from(key).insert(row);if(error)throw error;return item;}
  this.data[key].push(item);fs.mkdirSync(require('node:path').dirname(this.file),{recursive:true});fs.writeFileSync(this.file,JSON.stringify(this.data,null,2),'utf8');return item;
 }
}
module.exports={Store};
