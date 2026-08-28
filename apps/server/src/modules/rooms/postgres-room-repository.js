'use strict';

function mapRoom(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    name: String(row.name),
    scenario: String(row.scenario || ''),
    passwordHash: String(row.password_hash || ''),
    state: row.state || null,
    createdAt: new Date(row.created_at).toISOString(),
    members: Array.isArray(row.members) ? row.members.map((member) => ({
      userId: String(member.userId),
      userName: String(member.userName || ''),
      role: String(member.role)
    })) : []
  };
}

const SELECT_ROOM = `
  SELECT r.*,
    COALESCE(jsonb_agg(jsonb_build_object(
      'userId', m.user_id,
      'userName', u.display_name,
      'role', m.role
    )) FILTER (WHERE m.user_id IS NOT NULL), '[]'::jsonb) AS members
  FROM rooms r
  LEFT JOIN room_members m ON m.room_id = r.id
  LEFT JOIN app_users u ON u.id = m.user_id
`;

function createPostgresRoomRepository(pool) {
  return Object.freeze({
    async list() {
      const result = await pool.query(`${SELECT_ROOM} GROUP BY r.id ORDER BY r.created_at DESC`);
      return result.rows.map(mapRoom);
    },
    async findById(id) {
      const result = await pool.query(`${SELECT_ROOM} WHERE r.id = $1 GROUP BY r.id`, [id]);
      return mapRoom(result.rows[0]);
    },
    async save(room) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const member of room.members || []) {
          await client.query(`
            INSERT INTO app_users(id, display_name) VALUES ($1, $2)
            ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = now()
          `, [member.userId, member.userName]);
        }
        await client.query(`
          INSERT INTO rooms(id, owner_id, name, scenario, password_hash, state, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            scenario = EXCLUDED.scenario,
            password_hash = EXCLUDED.password_hash,
            state = EXCLUDED.state,
            updated_at = now()
        `, [room.id, room.ownerId, room.name, room.scenario, room.passwordHash, room.state, room.createdAt]);
        await client.query('DELETE FROM room_members WHERE room_id = $1', [room.id]);
        for (const member of room.members || []) {
          await client.query('INSERT INTO room_members(room_id, user_id, role) VALUES ($1, $2, $3)', [room.id, member.userId, member.role]);
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      return this.findById(room.id);
    },
    async deleteById(id) {
      const result = await pool.query('DELETE FROM rooms WHERE id = $1', [id]);
      return result.rowCount > 0;
    }
  });
}

module.exports = { createPostgresRoomRepository, mapRoom };
