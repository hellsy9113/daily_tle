import fetchWeeklyQuestion from "@/controllers/fetechWeeklyQuestion"

import weeklySolvedQuestionQuery from "@/GQLqueries/weeklySolved"

export async function GET(
    _request:Request,
    {params}:{params:Promise<{username:string}>},

){
   const {username}= await params;
   const data= await fetchWeeklyQuestion(
    weeklySolvedQuestionQuery,
    {username}
   )
   return Response.json(data)
}
