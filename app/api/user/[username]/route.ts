import fetchUserProfile from "@/controllers/fetchUserProfile"

import query from "@/GQLqueries/userProfile"

import {formatUserProfileData} from "@/utils/fomatUserProfile"

export async function GET(
    {params}:{params:Promise<{username:string}>},

){
   const {username}= await params;
   const data= await fetchUserProfile(
    query,
    {username},
    formatUserProfileData
   )
   return Response.json(data)
}
