// graphql/weeklySolved.ts

const weeklySolvedQuestionQuery = `#graphql
query getWeeklySolved($username: String!, $limit: Int = 20) {
  recentSubmissionList(username: $username, limit: $limit) {
    title
    titleSlug
    timestamp
    statusDisplay
    lang
  }
}`;

export default weeklySolvedQuestionQuery;
