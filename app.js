'use strict';
const $=id=>document.getElementById(id);
const cfg=window.MOTORA_CONFIG;
const client=window.supabase?.createClient(cfg.url,cfg.publishableKey);
let user=null, vehicles=[], editing=null, enquiryVehicleId=null;
const demo=[{id:'demo-1',make:'BMW',model:'M340i xDrive',model_year:2021,price:32995,mileage:34500,location:'Nottingham',fuel:'Petrol',gearbox:'Automatic',description:'Fictional demonstration vehicle — not for sale.',demo:true},{id:'demo-2',make:'Audi',model:'S3 Sportback',model_year:2020,price:24950,mileage:41000,location:'Leicester',fuel:'Petrol',gearbox:'Automatic',description:'Fictional demonstration vehicle — not for sale.',demo:true},{id:'demo-3',make:'Porsche',model:'718 Cayman',model_year:2018,price:38995,mileage:28000,location:'Lincoln',fuel:'Petrol',gearbox:'Automatic',description:'Fictional demonstration vehicle — not for sale.',demo:true}];
const money=n=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',maximumFractionDigits:0}).format(n);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const carSvg='<svg viewBox="0 0 500 220" aria-label="Car illustration"><path d="M45 139 L100 120 L163 67 Q182 55 230 55 L336 65 Q360 67 393 110 L450 129 Q465 138 463 163 L43 163Z" fill="#1d586a" stroke="#8fc6d1" stroke-width="3"/><path d="M148 120 L178 76 Q195 68 230 68 L326 76 Q345 78 367 120Z" fill="#243c50"/><circle cx="130" cy="165" r="35" fill="#172632" stroke="#90aab7" stroke-width="8"/><circle cx="374" cy="165" r="35" fill="#172632" stroke="#90aab7" stroke-width="8"/></svg>';
function isOwner(c){return !!user && c.seller_id===user.id}
function all(){return [...vehicles.filter(c=>c.status==='published'||isOwner(c)),...demo]}
function photo(c){const u=c.image_urls?.[0];if(!u)return carSvg;const path=u.replace(/^https?:\/\/[^/]+\/storage\/v1\/object\/public\/vehicle-photos\//,'');const {data}=client.storage.from('vehicle-photos').getPublicUrl(path);return `<img src="${esc(data.publicUrl)}" alt="${esc(c.make+' '+c.model)}" loading="lazy">`}
function render(){const q=$('search').value.toLowerCase().trim(),mk=$('makeFilter').value,max=Number($('priceFilter').value)||Infinity,sort=$('sort').value;const makes=[...new Set(all().map(c=>c.make))].sort();$('makeFilter').innerHTML='<option value="">All makes</option>'+makes.map(m=>`<option value="${esc(m)}" ${m===mk?'selected':''}>${esc(m)}</option>`).join('');const arr=all().filter(c=>`${c.make} ${c.model} ${c.location}`.toLowerCase().includes(q)&&(!mk||c.make===mk)&&Number(c.price)<=max);arr.sort((a,b)=>sort==='low'?a.price-b.price:sort==='high'?b.price-a.price:sort==='mileage'?a.mileage-b.mileage:Date.parse(b.created_at||0)-Date.parse(a.created_at||0));$('count').textContent=`${arr.length} listing${arr.length===1?'':'s'}`;$('empty').hidden=!!arr.length;$('cards').innerHTML=arr.map(c=>`<article class="carCard"><div class="carImage">${photo(c)}<span class="pill">${c.demo?'FICTIONAL DEMO':c.status==='pending'?'AWAITING APPROVAL':'LISTED VEHICLE'}</span></div><div class="carContent"><h3>${esc(c.model_year+' '+c.make+' '+c.model)}</h3><p class="carPrice">${money(c.price)}</p><div class="carMeta"><span>${Number(c.mileage).toLocaleString('en-GB')} miles</span><span>• ${esc(c.fuel||'Not specified')}</span><span>• ${esc(c.gearbox||'Not specified')}</span></div><div class="cardFooter"><span>⌖ ${esc(c.location)}</span><button class="viewBtn" data-view="${esc(c.id)}">View details ↗</button></div></div></article>`).join('')}
async function refresh(){const {data,error}=await client.from('vehicles').select('*').order('created_at',{ascending:false}).limit(200);if(error){console.error(error);alert('Could not load listings: '+error.message);return}vehicles=data||[];render()}
function authOpen(){$('authError').textContent='';$('authDialog').showModal()}
function updateAccount(){$('accountBtn').textContent=user?'Sign out':'Sign in / Register'}
async function syncUser(){const {data:{user:u}}=await client.auth.getUser();user=u;updateAccount();await refresh()}
function openSell(c){if(!user){authOpen();return}editing=c?.id||null;$('sellForm').reset();$('formError').textContent='';$('formTitle').textContent=c?'Edit your listing':'List your car';$('saveBtn').textContent=c?'Save changes':'Submit for approval';if(c){for(const [field,key] of Object.entries({make:'make',model:'model',year:'model_year',price:'price',mileage:'mileage',location:'location',fuel:'fuel',gearbox:'gearbox',description:'description'}))$('sellForm').elements[field].value=c[key]??''}$('sellDialog').showModal()}
function detail(id){const c=all().find(x=>x.id===id);if(!c)return;$('detailBody').innerHTML=`<div class="detailImg">${photo(c)}</div><h2 style="margin-top:20px">${esc(c.model_year+' '+c.make+' '+c.model)}</h2><p class="carPrice">${money(c.price)}</p><div class="detailGrid">${[['Mileage',Number(c.mileage).toLocaleString('en-GB')+' miles'],['Location',c.location],['Fuel',c.fuel||'—'],['Gearbox',c.gearbox||'—'],['Status',c.demo?'Fictional demo':c.status],['Year',c.model_year]].map(([k,v])=>`<div><small>${k}</small>${esc(v)}</div>`).join('')}</div><p class="detailDesc">${esc(c.description||'No description provided.')}</p><p class="note">${c.demo?'This is a fictional demonstration vehicle, not for sale.':'Never send money for a vehicle based only on an online listing.'}</p>${!c.demo&&c.status==='published'&&!isOwner(c)?`<button class="primary" data-enquire="${esc(c.id)}">Contact seller ↗</button>`:''}`;$('detailDialog').showModal()}
function manage(){if(!user){authOpen();return}const mine=vehicles.filter(isOwner);$('manageBody').innerHTML=mine.length?mine.map(c=>`<div class="manageRow"><div><strong>${esc(c.model_year+' '+c.make+' '+c.model)}</strong><small>${money(c.price)} · ${esc(c.location)} · ${esc(c.status)}</small></div><div>${c.status==='pending'?`<button data-edit="${esc(c.id)}">Edit</button>`:''}<button class="danger" data-delete="${esc(c.id)}">Delete</button></div></div>`).join(''):'<p>No listings yet. Add your first car to get started.</p>';$('manageDialog').showModal()}

function openEnquiry(id){
  const c=vehicles.find(v=>v.id===id&&v.status==='published');
  if(!c)return;
  if(!user){$('detailDialog').close();authOpen();return;}
  if(isOwner(c))return;
  enquiryVehicleId=id;
  $('enquiryForm').reset();$('enquiryError').textContent='';
  $('enquiryVehicle').textContent=`Regarding: ${c.model_year} ${c.make} ${c.model} — ${money(c.price)}`;
  $('detailDialog').close();$('enquiryDialog').showModal();
}
$('enquiryForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const btn=$('enquirySubmit');btn.disabled=true;$('enquiryError').textContent='';
  try{
    if(!user||!enquiryVehicleId)throw Error('Sign in and select a car first.');
    const message=String(new FormData(e.currentTarget).get('message')||'').trim();
    if(message.length<10||message.length>2000)throw Error('Please write between 10 and 2000 characters.');
    const {error}=await client.from('vehicle_enquiries').insert({vehicle_id:enquiryVehicleId,buyer_id:user.id,message});
    if(error)throw error;
    $('enquiryDialog').close();alert('Enquiry sent. You can see replies under Enquiries.');
  }catch(err){$('enquiryError').textContent=err.message||'Unable to send enquiry.'}
  finally{btn.disabled=false}
});
async function openInbox(){
  if(!user){authOpen();return}
  $('inboxError').textContent='';$('inboxBody').innerHTML='<p>Loading enquiries…</p>';
  $('inboxDialog').showModal();
  const {data,error}=await client.from('vehicle_enquiries').select('id,vehicle_id,buyer_id,seller_id,message,seller_reply,created_at,replied_at').order('created_at',{ascending:false}).limit(100);
  if(error){$('inboxError').textContent=error.message;$('inboxBody').innerHTML='';return}
  const ids=[...new Set((data||[]).map(x=>x.vehicle_id))];
  const titles=new Map(vehicles.map(v=>[v.id,`${v.model_year} ${v.make} ${v.model}`]));
  if(ids.length){const {data:cars}=await client.from('vehicles').select('id,make,model,model_year').in('id',ids);for(const c of cars||[])titles.set(c.id,`${c.model_year} ${c.make} ${c.model}`)}
  $('inboxBody').innerHTML=(data||[]).length?(data||[]).map(x=>{
    const seller=x.seller_id===user.id;
    return `<article class="enquiryItem"><div class="enquiryTop"><strong>${esc(titles.get(x.vehicle_id)||'Vehicle enquiry')}</strong><span>${seller?'Received from buyer':'Sent to seller'}</span></div><small>${esc(new Date(x.created_at).toLocaleString('en-GB'))}</small><p class="enquiryMessage">${esc(x.message)}</p>${x.seller_reply?`<div class="enquiryReply"><strong>Seller reply</strong><p>${esc(x.seller_reply)}</p></div>`:seller?`<form class="replyForm" data-reply-id="${esc(x.id)}"><label>Reply to buyer<textarea name="reply" required minlength="2" maxlength="2000" rows="3" placeholder="Write your reply…"></textarea></label><button class="primary" type="submit">Send reply</button></form>`:'<p class="note">Awaiting seller reply.</p>'}</article>`
  }).join(''):'<p>No enquiries yet. Messages from buyers and replies to your enquiries will appear here.</p>';
}
$('inboxBody').addEventListener('submit',async e=>{
  const f=e.target.closest('form[data-reply-id]');if(!f)return;e.preventDefault();
  const reply=String(new FormData(f).get('reply')||'').trim();
  if(reply.length<2||reply.length>2000)return;
  const b=f.querySelector('button');b.disabled=true;
  const {error}=await client.from('vehicle_enquiries').update({seller_reply:reply}).eq('id',f.dataset.replyId).eq('seller_id',user.id);
  if(error){$('inboxError').textContent=error.message;b.disabled=false;return}
  await openInbox();
});
$('inboxBtn').addEventListener('click',openInbox);
$('authForm').addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);$('authError').textContent='';const {error}=await client.auth.signInWithPassword({email:String(fd.get('email')),password:String(fd.get('password'))});if(error){$('authError').textContent=error.message;return}$('authDialog').close();await syncUser()});
$('signUpBtn').addEventListener('click',async()=>{const f=$('authForm');if(!f.reportValidity())return;const fd=new FormData(f);$('authError').textContent='';const {error}=await client.auth.signUp({email:String(fd.get('email')),password:String(fd.get('password')),options:{emailRedirectTo:location.origin}});$('authError').textContent=error?error.message:'Check your email for a confirmation link, then return and sign in.'});
$('accountBtn').addEventListener('click',async()=>{if(user){await client.auth.signOut();user=null;updateAccount();await refresh()}else authOpen()});
$('sellForm').addEventListener('submit',async e=>{e.preventDefault();$('formError').textContent='';$('saveBtn').disabled=true;try{if(!user)throw Error('Sign in first.');const f=e.currentTarget,fd=new FormData(f),file=f.elements.photo.files[0];const previous=vehicles.find(c=>c.id===editing);const item={seller_id:user.id,make:String(fd.get('make')).trim(),model:String(fd.get('model')).trim(),model_year:Number(fd.get('year')),price:Number(fd.get('price')),mileage:Number(fd.get('mileage')),location:String(fd.get('location')).trim(),fuel:String(fd.get('fuel')),gearbox:String(fd.get('gearbox')),description:String(fd.get('description')).trim(),image_urls:previous?.image_urls||[]};if(!item.make||!item.model||!item.location||item.price<=0||item.mileage<0||item.model_year<1950||item.model_year>new Date().getFullYear()+1)throw Error('Check the vehicle details.');if(file){if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>2*1024*1024)throw Error('Photo must be JPG, PNG or WebP and under 2 MB.');const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';const path=`${user.id}/${crypto.randomUUID()}.${ext}`;const {error:uploadError}=await client.storage.from('vehicle-photos').upload(path,file,{contentType:file.type,upsert:false});if(uploadError)throw uploadError;item.image_urls=[path]}const res=editing?await client.from('vehicles').update(item).eq('id',editing).eq('seller_id',user.id):await client.from('vehicles').insert({...item,status:'pending'});if(res.error)throw res.error;$('sellDialog').close();await refresh();location.hash='browse';alert('Listing saved. It will be public once approved.')}catch(err){$('formError').textContent=err.message||'Could not save listing.'}finally{$('saveBtn').disabled=false}});
document.addEventListener('click',async e=>{const t=e.target.closest('button');if(!t)return;if(t.hasAttribute('data-close')){t.closest('dialog').close();return}if(t.dataset.view)detail(t.dataset.view);if(t.dataset.enquire)openEnquiry(t.dataset.enquire);if(t.dataset.edit){const c=vehicles.find(x=>x.id===t.dataset.edit&&isOwner(x));$('manageDialog').close();if(c)openSell(c)}if(t.dataset.delete){const c=vehicles.find(x=>x.id===t.dataset.delete&&isOwner(x));if(!c||!confirm('Delete this listing permanently?'))return;const {error}=await client.from('vehicles').delete().eq('id',c.id).eq('seller_id',user.id);if(error)alert(error.message);else{await refresh();manage()}}});
for(const id of ['sellBtn','heroSell','emptySell','bottomSell'])$(id).addEventListener('click',()=>openSell());$('manageBtn').addEventListener('click',manage);for(const id of ['search','makeFilter','priceFilter','sort'])$(id).addEventListener(id==='search'?'input':'change',render);for(const d of document.querySelectorAll('dialog'))d.addEventListener('click',e=>{if(e.target===d)d.close()});
if(!client){alert('Supabase library did not load. Check your connection.')}else{client.auth.onAuthStateChange((_event,session)=>{user=session?.user||null;updateAccount()});syncUser().catch(err=>alert('Connection error: '+err.message))}
