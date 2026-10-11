const SUBMISSION_FIELDS = `
  title
  titleSlug
  timestamp
  statusDisplay
  lang
`;

export const USER_PROFILE_QUERY = `#graphql
query getUserProfile($username: String!) {
  allQuestionsCount { difficulty count }
  matchedUser(username: $username) {
    contributions { points }
    profile { ranking reputation }
    submitStats {
      totalSubmissionNum { difficulty count submissions }
      acSubmissionNum { difficulty count submissions }
    }
    submissionCalendar
  }
  recentSubmissionList(username: $username, limit: 20) {
    ${SUBMISSION_FIELDS}
  }
}`;

export const RECENT_SUBMISSIONS_QUERY = `#graphql
query getRecentSubmissions($username: String!, $limit: Int = 20) {
  recentSubmissionList(username: $username, limit: $limit) {
    ${SUBMISSION_FIELDS}
  }
}`;
