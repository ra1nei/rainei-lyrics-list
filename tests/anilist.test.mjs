import test from 'node:test';
import assert from 'node:assert/strict';
import { createAniListClient, selectedAnime, animeId, animeFormatLabel, withAnimeFormats } from '../src/lib/anilist.mjs';
const media={id:154587,title:{romaji:'Sousou no Frieren',english:'Frieren: Beyond Journey’s End',native:'葬送のフリーレン'},coverImage:{extraLarge:'https://s4.anilist.co/original.png',large:'https://s4.anilist.co/large.png'},startDate:{year:2023},format:'TV',siteUrl:'https://anilist.co/anime/154587'};
test('Selection preserves exact AniList titles and original extraLarge poster URL',()=>{
  for(const language of ['romaji','english','native']){
    const value=selectedAnime(media,language);assert.equal(value.title,media.title[language]);assert.equal(value.cover,media.coverImage.extraLarge);assert.equal(value.anilistId,154587);
  }
  assert.equal(selectedAnime({...media,title:{romaji:'Exact name',english:null}},'english').title,'Exact name');
});
test('AniList URLs and IDs are exact, unrelated URLs are rejected',()=>{
  assert.equal(animeId('https://anilist.co/anime/154587/Sousou-no-Frieren/'),154587);
  assert.equal(animeId('154587'),154587);assert.equal(animeId('https://evil.test/anime/154587'),null);
});
test('Search uses POST GraphQL variables and paginates; duplicate queries use cache',async()=>{
  const requests=[];const client=createAniListClient(async(url,options)=>{requests.push({url,...options});return Response.json({data:{Page:{media:[media],pageInfo:{hasNextPage:true}}}});});
  const result=await client('Frieren');assert.equal(result.media[0].id,154587);assert.equal(result.hasNextPage,true);
  await client('Frieren');assert.equal(requests.length,1);await client('Frieren',2);assert.equal(requests.length,2);
  const body=JSON.parse(requests[1].body);assert.deepEqual(body.variables,{search:'Frieren',page:2});assert.match(body.query,/type: ANIME/);assert.equal(requests[0].method,'POST');
});
test('Pasted URL requests the exact anime rather than ambiguous title search',async()=>{
  const client=createAniListClient(async(url,options)=>{assert.deepEqual(JSON.parse(options.body).variables,{id:154587});return Response.json({data:{Media:media}});});
  assert.equal((await client('https://anilist.co/anime/154587/')).media[0].id,154587);
});
test('429 uses Retry-After and prevents additional requests until cooldown',async()=>{
  let clock=1000,calls=0;const client=createAniListClient(async()=>{calls++;return new Response('{}',{status:429,headers:{'Retry-After':'30'}});},()=>clock);
  await assert.rejects(client('Frieren'),/30 giây/);await assert.rejects(client('Kaguya'),/30 giây/);assert.equal(calls,1);
  clock+=31000;await assert.rejects(client('Kaguya'),/30 giây/);assert.equal(calls,2);
});
test('GraphQL errors and cancellation are surfaced',async()=>{
  const client=createAniListClient(async()=>Response.json({errors:[{message:'Invalid search'}]}));await assert.rejects(client('test'),/Invalid search/);
  const aborted=createAniListClient(async(url,options)=>{options.signal.throwIfAborted();});const c=new AbortController();c.abort();await assert.rejects(aborted('test',1,c.signal),{name:'AbortError'});
});

test('All title variants are sent unchanged through the same AniList search query',async()=>{
  const terms=['Sousou no Frieren',"Frieren: Beyond Journey's End",'葬送のフリーレン'];
  const sent=[];
  const client=createAniListClient(async(url,options)=>{
    const body=JSON.parse(options.body);sent.push(body.variables.search);
    assert.match(body.query,/title \{ romaji english native \}/);
    return Response.json({data:{Page:{media:[media],pageInfo:{hasNextPage:false}}}});
  });
  for(const term of terms)await client(term);
  assert.deepEqual(sent,terms);
});


test('AniList formats are fetched in batches of 50, deduplicated and cached',async()=>{
  const requests=[];
  const client=createAniListClient(async(url,options)=>{
    const body=JSON.parse(options.body);requests.push(body);
    return Response.json({data:{Page:{media:body.variables.ids.map(id=>({id,format:id===1?'MOVIE':'TV'}))}}});
  });
  const formats=await client.formats([...Array.from({length:51},(_,i)=>i+1),1,0,-1]);
  assert.equal(requests.length,2);assert.equal(requests[0].variables.ids.length,50);
  assert.match(requests[0].query,/media\(id_in: \$ids, type: ANIME\)/);
  assert.equal(formats.get(1),'MOVIE');assert.equal(formats.get(51),'TV');
  await client.formats([1,51]);assert.equal(requests.length,2);
  assert.equal(animeFormatLabel('MOVIE'),'Movie');assert.equal(animeFormatLabel('TV_SHORT'),'TV Short');assert.equal(animeFormatLabel('OVA'),'OVA');
});

test('Missing legacy formats are filled without overwriting saved formats, titles or lyrics',async()=>{
  const entries=[{id:'old',kind:'series',data:{anilistId:1,title:'Original',vietnamese:'Tên Việt'}},{id:'custom',kind:'series',data:{anilistId:2,title:'Custom',format:'OVA'}},{id:'song',kind:'song',data:{body:'Private lyrics'}}];
  let calls=0;const client={formats:async ids=>{calls++;assert.deepEqual(ids,[1]);return new Map([[1,'MOVIE'],[2,'TV']]);}};
  const result=await withAnimeFormats(entries,client);
  assert.equal(result[0].data.format,'MOVIE');assert.equal(result[0].data.title,'Original');assert.equal(result[0].data.vietnamese,'Tên Việt');
  assert.equal(result[1],entries[1]);assert.equal(result[2],entries[2]);assert.equal(entries[0].data.format,undefined);assert.equal(calls,1);
  const failed=await withAnimeFormats(entries,{formats:async()=>{throw Error('Offline');}});
  assert.equal(failed,entries);
});

test('Format loading shares the AniList rate limit with search',async()=>{
  let calls=0;const client=createAniListClient(async()=>{calls++;return new Response('{}',{status:429,headers:{'Retry-After':'30'}});});
  await assert.rejects(client.formats([1]),/30 giây/);
  await assert.rejects(client('Frieren'),/30 giây/);assert.equal(calls,1);
});
