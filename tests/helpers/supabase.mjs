import { createStore, publishSnapshot } from '../../src/lib/store.mjs';
export function createTestDatabase(seed=[]) {
  let drafts=structuredClone(seed), published=structuredClone(seed);
  const calls=[];
  const storage={getItem:()=>JSON.stringify({access_token:'test',expires_at:Date.now()/1000+3600}),setItem(){},removeItem(){}};
  const fetcher=async (input,options={})=>{
    const url=new URL(input),route=url.pathname,method=options.method||'GET';calls.push({route,method});
    if(route==='/rest/v1/admin_users')return Response.json([{user_id:'test'}]);
    if(route==='/rest/v1/published_entries')return Response.json(published.slice(Number(url.searchParams.get('offset')),Number(url.searchParams.get('offset'))+500));
    if(route==='/rest/v1/entries'){
      if(method==='GET')return Response.json(drafts.slice(Number(url.searchParams.get('offset')),Number(url.searchParams.get('offset'))+500));
      if(method==='POST'){
        const value=JSON.parse(options.body),rows=Array.isArray(value)?value:[value],ids=new Set(rows.map(e=>e.id));
        drafts=[...drafts.filter(e=>!ids.has(e.id)),...rows];return new Response(null,{status:204});
      }
      if(method==='DELETE'){
        const id=url.searchParams.get('id').slice(3);drafts=drafts.filter(e=>e.id!==id&&e.parent_id!==id);published=published.filter(e=>e.id!==id&&e.parent_id!==id);return new Response(null,{status:204});
      }
    }
    const id=options.body?JSON.parse(options.body).entry_id:null;
    if(route==='/rest/v1/rpc/publish_entry'){published=publishSnapshot(drafts,published,id);return new Response(null,{status:204});}
    if(route==='/rest/v1/rpc/unpublish_entry'){published=published.filter(e=>e.id!==id&&e.parent_id!==id);return new Response(null,{status:204});}
    throw Error('Unexpected API request: '+route);
  };
  return {calls,client:()=>createStore({url:'https://database.test',key:'public-test',storage,fetcher})};
}
export const createTestStore=({seed=[]}={})=>createTestDatabase(seed).client();
