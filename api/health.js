// Endpoint de verification : GET /api/health
// Permet de tester que le backend tourne et quelles cles sont configurees.

export default function handler(req, res) {
  res.status(200).setHeader("content-type", "application/json");
  res.end(
    JSON.stringify({
      status: "ok",
      service: "fridgechef-backend",
      model: process.env.GEMINI_MODEL || "gemini-3.1-flash-lite",
      config: {
        geminiKey: !!process.env.GEMINI_API_KEY,
        appSecret: !!process.env.APP_SECRET,
        redis: !!(
          (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL) &&
          (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN)
        ),
        freeDailyLimit: parseInt(process.env.FREE_DAILY_LIMIT || "3", 10),
      },
      time: new Date().toISOString(),
    })
  );
}
