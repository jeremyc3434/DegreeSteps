/** Scripted stand-in for the Messages API, for the loopback preview and browser tests only (COACH_FETCH=mock).
 * It never touches the network. It calls one coach tool, then answers from that tool's real result. */
const SUBJECTS=['psychology','business','accounting','finance','marketing','communications','criminal justice','history','health','religion','technology'];
const usage=(input,output)=>({input_tokens:input,output_tokens:output,cache_creation_input_tokens:0,cache_read_input_tokens:2400});
const reply=(content,stop_reason,u)=>new Response(JSON.stringify({id:'msg_mock',type:'message',role:'assistant',model:'mock',content,stop_reason,usage:u}),{status:200,headers:{'Content-Type':'application/json'}});

function firstToolCall(question){
  const text=question.toLowerCase();
  if(/\b(mean|meaning|what is|what does)\b/.test(text))return{name:'explain',input:{topic:/estimate|cost/.test(text)?'planning-estimate':/residen/.test(text)?'residency':/starting route/.test(text)?'starting-route':'needs-school-confirmation'}};
  const course=text.match(/\b(sophia|study\.com|straighterline|saylor|clep|dsst)\b[^a-z0-9]*(.{3,60}?)(?:\?|$| count| transfer)/);
  if(course)return{name:'find_course_credit',input:{provider:course[1],course:course[2].replace(/^(?:course|class)\s+/,'').trim()}};
  const subject=SUBJECTS.find(item=>text.includes(item));
  return{name:'search_plans',input:{...(subject?{subject}:{}),...(/\bonline\b/.test(text)?{format:'online'}:{}),...(/cheap|cost|lowest/.test(text)?{sort:'estimate'}:{})}};
}
function answerFrom(name,result){
  if(result.error)return 'That is not in DegreeSteps\' data yet. Ask the school directly, or browse the plan finder at /programs.html.\nNext step: Open the plan finder.';
  if(name==='explain')return result.explanation.split('. ').slice(0,2).join('. ').replace(/\.?$/,'.')+'\n- Read more: '+(result.links?.[0]||'/faq/')+'\nNext step: Open a plan in the plan finder at /programs.html.';
  if(name==='find_course_credit'){
    if(!result.found)return 'That course is not in DegreeSteps\' data yet, so ask the school whether it applies.\nNext step: Browse listed courses at /transfer/.';
    const course=result.courses[0],first=course.listed_in[0];
    return course.provider+' '+course.title+' is listed in '+first.school+'\'s published transfer guidance for '+first.degree+' ('+first.status+'). The school still decides what it awards.\n- Where it counts: '+course.transfer_page+'\nNext step: Open the plan at '+first.plan_link;
  }
  const plan=result.plans?.[0];
  if(!plan)return 'No researched DegreeSteps plan matches that yet. It is not in our data, so ask the school.\nNext step: Browse the plan finder at /programs.html.';
  return plan.school+' '+plan.title+' ('+plan.status+'): '+plan.starting_route.outside_credits+' outside '+plan.starting_route.unit+' on its starting route. '+plan.cost+'.\n- Plan: '+(plan.links.plan_page||plan.links.open_in_planner)+'\nNext step: Open it in the planner at '+plan.links.open_in_planner;
}
export function createMockCoachFetch(){
  return async(url,options={})=>{
    if(url!=='https://api.anthropic.com/v1/messages')throw Error('The coach mock only answers the Messages API.');
    const body=JSON.parse(options.body),last=body.messages.at(-1),blocks=Array.isArray(last.content)?last.content:[{type:'text',text:String(last.content)}];
    const toolResult=blocks.find(block=>block.type==='tool_result');
    if(toolResult){
      const previous=body.messages.at(-2).content.find(block=>block.type==='tool_use');
      return reply([{type:'text',text:answerFrom(previous.name,JSON.parse(toolResult.content))}],'end_turn',usage(1800,140));
    }
    const question=blocks.filter(block=>block.type==='text').map(block=>block.text)[0]||'';
    if(/\b(poem|recipe|weather)\b/i.test(question))return reply([],'refusal',usage(400,0));
    const call=firstToolCall(question);
    return reply([{type:'thinking',thinking:'',signature:'mock'},{type:'tool_use',id:'toolu_mock_'+Date.now().toString(36),name:call.name,input:call.input}],'tool_use',usage(900,60));
  };
}
