 export interface UserDataProfile {
  aboutMe: string;
  company?: string;
  countryName?: string;
  realName: string;
  birthday?: string;
  userAvatar: string;
  ranking: number;
  reputation: number;
  school?: string;
  skillTags: string[];
  websites: string[];
}

export interface GraphQLParams {
  username?: string;
  [key: string]: unknown;
}

export interface UserProfileResponse {
  matchedUser: {
    submitStats: {
      acSubmissionNum: Array<{ count: number }>;
      totalSubmissionNum: unknown;
    };
    submissionCalendar: string;
    profile: {
      ranking: number;
      reputation: number;
    };
    contributions: {
      points: number;
    };
  };
  allQuestionsCount: Array<{ count: number }>;
  recentSubmissionList: unknown[];
}
