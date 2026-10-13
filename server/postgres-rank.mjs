import { nickKey, NICK_MAX, sanitizeLine } from './rank-shared.mjs';

// Neon (MIT): https://neon.com/docs/serverless/serverless-driver
// Parameterized query API; PostgreSQL UNIQUE arbitrates competing claims atomically.
export function createPostgresRankStore(sql) {
  return {
    async claim(id, nick) {
      const key = nickKey(nick);
      if (!id || !key || key.length > NICK_MAX) return 400;
      try {
        await sql.query(`INSERT INTO rank_players (id, nick_key, nick) VALUES ($1, $2, $3)
          ON CONFLICT (id) DO UPDATE SET nick_key = EXCLUDED.nick_key, nick = EXCLUDED.nick`,
        [id, key, String(nick).normalize('NFC').trim().replace(/\s+/g, ' ')]);
        return 200;
      } catch (error) {
        if (error.code === '23505' && error.constraint === 'rank_players_nick_key_key') return 409;
        throw error;
      }
    },
    async post(id, line) {
      if (!line || typeof line !== 'object') return 403;
      const rows = await sql.query('UPDATE rank_players SET line = $2::jsonb WHERE id = $1 RETURNING id',
        [id, JSON.stringify(sanitizeLine(line, ''))]);
      return rows.length ? 200 : 403;
    },
    async lines() {
      const rows = await sql.query('SELECT nick, line FROM rank_players WHERE line IS NOT NULL');
      return rows.map(({ nick, line }) => sanitizeLine(line, nick));
    }
  };
}
