// src/lib/school/credentials.ts
// 学业助手 — 凭据 CRUD

import { db } from '@/lib/db'

export function saveCredentials(
  userId: string,
  school: string,
  username: string,
  password: string,
): void {
  const now = Date.now()
  db.prepare(
    `INSERT INTO school_credentials (user_id, school, username, password, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, school) DO UPDATE SET username = ?, password = ?, updated_at = ?`,
  ).run(userId, school, username, password, now, username, password, now)
}

export function getCredentials(
  userId: string,
  school: string,
): { username: string; password: string } | null {
  const row = db.prepare(
    'SELECT username, password FROM school_credentials WHERE user_id = ? AND school = ?',
  ).get(userId, school) as { username: string; password: string } | undefined
  return row || null
}

export function deleteCredentials(userId: string, school: string): void {
  db.prepare('DELETE FROM school_credentials WHERE user_id = ? AND school = ?').run(userId, school)
}
