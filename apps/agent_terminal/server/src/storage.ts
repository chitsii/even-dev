import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export type StoredTaskMode = 'draft' | 'discuss' | 'implement'

export type StoredTask = {
  id: string
  title: string
  status: 'active' | 'closed' | 'failed'
  lastMode: StoredTaskMode
  createdAt: number
  updatedAt: number
}

export type StoredSegment = {
  id: string
  taskId: string
  text: string
  source: 'voice' | 'manual'
  ordinal: number
  createdAt: number
}

export type StoredMessage = {
  id: string
  taskId: string
  role: 'user' | 'assistant'
  mode: 'discuss' | 'implement'
  text: string
  createdAt: number
}

export type StoredTaskDetail = {
  task: StoredTask
  segments: StoredSegment[]
  messages: StoredMessage[]
}

export type AgentTerminalStorage = ReturnType<typeof createAgentTerminalStorage>
type StorageOptions = {
  maxTasks?: number
}

function ensureTasksColumns(db: DatabaseSync): void {
  const columns = db.prepare('PRAGMA table_info(tasks)').all() as Array<{ name: string }>
  const names = new Set(columns.map((column) => column.name))

  if (!names.has('last_mode')) {
    db.exec(`ALTER TABLE tasks ADD COLUMN last_mode TEXT NOT NULL DEFAULT 'draft';`)
  }
}

export function createAgentTerminalStorage(filename = ':memory:', options: StorageOptions = {}) {
  if (filename !== ':memory:') {
    mkdirSync(dirname(filename), { recursive: true })
  }

  const maxTasks = Math.max(1, options.maxTasks ?? 5)
  const db = new DatabaseSync(filename)
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS task_segments (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      text TEXT NOT NULL,
      source TEXT NOT NULL,
      ordinal INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(task_id) REFERENCES tasks(id)
    );

    CREATE INDEX IF NOT EXISTS idx_task_segments_task_id_ordinal
      ON task_segments(task_id, ordinal);

    CREATE TABLE IF NOT EXISTS task_messages (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      role TEXT NOT NULL,
      mode TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(task_id) REFERENCES tasks(id)
    );

    CREATE INDEX IF NOT EXISTS idx_task_messages_task_id_created_at
      ON task_messages(task_id, created_at);
  `)
  ensureTasksColumns(db)

  const createTaskStatement = db.prepare(`
    INSERT INTO tasks (id, title, status, last_mode, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `)
  const listTasksStatement = db.prepare(`
    SELECT id, title, status, last_mode, created_at, updated_at
    FROM tasks
    ORDER BY updated_at DESC, created_at DESC
  `)
  const getTaskStatement = db.prepare(`
    SELECT id, title, status, last_mode, created_at, updated_at
    FROM tasks
    WHERE id = ?
  `)
  const getLastActiveTaskStatement = db.prepare(`
    SELECT id, title, status, last_mode, created_at, updated_at
    FROM tasks
    WHERE status = 'active'
    ORDER BY updated_at DESC, created_at DESC
    LIMIT 1
  `)
  const updateTaskStateStatement = db.prepare(`
    UPDATE tasks
    SET status = COALESCE(?, status),
        last_mode = COALESCE(?, last_mode),
        updated_at = ?
    WHERE id = ?
  `)
  const appendSegmentStatement = db.prepare(`
    INSERT INTO task_segments (id, task_id, text, source, ordinal, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `)
  const nextOrdinalStatement = db.prepare(`
    SELECT COALESCE(MAX(ordinal), 0) + 1 AS next_ordinal
    FROM task_segments
    WHERE task_id = ?
  `)
  const listSegmentsStatement = db.prepare(`
    SELECT id, task_id, text, source, ordinal, created_at
    FROM task_segments
    WHERE task_id = ?
    ORDER BY ordinal ASC
  `)
  const removeLastSegmentStatement = db.prepare(`
    DELETE FROM task_segments
    WHERE id = (
      SELECT id
      FROM task_segments
      WHERE task_id = ?
      ORDER BY ordinal DESC
      LIMIT 1
    )
    RETURNING id, task_id, text, source, ordinal, created_at
  `)
  const clearSegmentsStatement = db.prepare(`
    DELETE FROM task_segments
    WHERE task_id = ?
  `)
  const appendMessageStatement = db.prepare(`
    INSERT INTO task_messages (id, task_id, role, mode, text, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `)
  const listMessagesStatement = db.prepare(`
    SELECT id, task_id, role, mode, text, created_at
    FROM task_messages
    WHERE task_id = ?
    ORDER BY created_at ASC
  `)
  const listTasksToPruneStatement = db.prepare(`
    SELECT id
    FROM tasks
    ORDER BY updated_at DESC, created_at DESC
    LIMIT -1 OFFSET ?
  `)
  const deleteTaskSegmentsStatement = db.prepare(`
    DELETE FROM task_segments
    WHERE task_id = ?
  `)
  const deleteTaskMessagesStatement = db.prepare(`
    DELETE FROM task_messages
    WHERE task_id = ?
  `)
  const deleteTaskStatement = db.prepare(`
    DELETE FROM tasks
    WHERE id = ?
  `)
  const clearAllSegmentsStatement = db.prepare(`
    DELETE FROM task_segments
  `)
  const clearAllMessagesStatement = db.prepare(`
    DELETE FROM task_messages
  `)
  const clearAllTasksStatement = db.prepare(`
    DELETE FROM tasks
  `)

  const mapTask = (row: Record<string, unknown>): StoredTask => ({
    id: String(row.id),
    title: String(row.title),
    status: String(row.status) as StoredTask['status'],
    lastMode: String(row.last_mode) as StoredTaskMode,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  })

  const mapSegment = (row: Record<string, unknown>): StoredSegment => ({
    id: String(row.id),
    taskId: String(row.task_id),
    text: String(row.text),
    source: String(row.source) as StoredSegment['source'],
    ordinal: Number(row.ordinal),
    createdAt: Number(row.created_at),
  })

  const mapMessage = (row: Record<string, unknown>): StoredMessage => ({
    id: String(row.id),
    taskId: String(row.task_id),
    role: String(row.role) as StoredMessage['role'],
    mode: String(row.mode) as StoredMessage['mode'],
    text: String(row.text),
    createdAt: Number(row.created_at),
  })

  const touchTask = (taskId: string, status?: StoredTask['status'], lastMode?: StoredTaskMode): void => {
    updateTaskStateStatement.run(status ?? null, lastMode ?? null, Date.now(), taskId)
  }

  const deleteTaskById = (taskId: string): void => {
    deleteTaskSegmentsStatement.run(taskId)
    deleteTaskMessagesStatement.run(taskId)
    deleteTaskStatement.run(taskId)
  }

  const pruneTasks = (): void => {
    const rows = listTasksToPruneStatement.all(maxTasks) as Array<{ id: string }>
    for (const row of rows) {
      deleteTaskById(String(row.id))
    }
  }

  return {
    createTask(title: string): StoredTask {
      const now = Date.now()
      const task: StoredTask = {
        id: randomUUID(),
        title,
        status: 'active',
        lastMode: 'draft',
        createdAt: now,
        updatedAt: now,
      }
      createTaskStatement.run(task.id, task.title, task.status, task.lastMode, task.createdAt, task.updatedAt)
      pruneTasks()
      return task
    },

    listTasks(): StoredTask[] {
      const rows = listTasksStatement.all() as Record<string, unknown>[]
      return rows.map(mapTask)
    },

    getTask(taskId: string): StoredTask | null {
      const row = getTaskStatement.get(taskId) as Record<string, unknown> | undefined
      return row ? mapTask(row) : null
    },

    getTaskDetail(taskId: string): StoredTaskDetail | null {
      const task = this.getTask(taskId)
      if (!task) {
        return null
      }
      return {
        task,
        segments: this.listSegments(taskId),
        messages: this.listMessages(taskId),
      }
    },

    getLastActiveTask(): StoredTask | null {
      const row = getLastActiveTaskStatement.get() as Record<string, unknown> | undefined
      return row ? mapTask(row) : null
    },

    updateTaskState(taskId: string, state: { status?: StoredTask['status']; lastMode?: StoredTaskMode }): StoredTask | null {
      touchTask(taskId, state.status, state.lastMode)
      return this.getTask(taskId)
    },

    closeTask(taskId: string): StoredTask | null {
      return this.updateTaskState(taskId, { status: 'closed' })
    },

    appendSegment(taskId: string, text: string, source: StoredSegment['source']): StoredSegment {
      const nextOrdinalRow = nextOrdinalStatement.get(taskId) as { next_ordinal: number }
      const segment: StoredSegment = {
        id: randomUUID(),
        taskId,
        text,
        source,
        ordinal: Number(nextOrdinalRow.next_ordinal),
        createdAt: Date.now(),
      }
      appendSegmentStatement.run(
        segment.id,
        segment.taskId,
        segment.text,
        segment.source,
        segment.ordinal,
        segment.createdAt,
      )
      touchTask(taskId, undefined, 'draft')
      return segment
    },

    listSegments(taskId: string): StoredSegment[] {
      const rows = listSegmentsStatement.all(taskId) as Record<string, unknown>[]
      return rows.map(mapSegment)
    },

    removeLastSegment(taskId: string): StoredSegment | null {
      const row = removeLastSegmentStatement.get(taskId) as Record<string, unknown> | undefined
      touchTask(taskId, undefined, 'draft')
      return row ? mapSegment(row) : null
    },

    clearSegments(taskId: string): void {
      clearSegmentsStatement.run(taskId)
      touchTask(taskId, undefined, 'draft')
    },

    appendMessage(taskId: string, role: StoredMessage['role'], mode: StoredMessage['mode'], text: string): StoredMessage {
      const message: StoredMessage = {
        id: randomUUID(),
        taskId,
        role,
        mode,
        text,
        createdAt: Date.now(),
      }
      appendMessageStatement.run(
        message.id,
        message.taskId,
        message.role,
        message.mode,
        message.text,
        message.createdAt,
      )
      touchTask(taskId, undefined, mode)
      return message
    },

    listMessages(taskId: string): StoredMessage[] {
      const rows = listMessagesStatement.all(taskId) as Record<string, unknown>[]
      return rows.map(mapMessage)
    },

    clearAllTasks(): void {
      clearAllSegmentsStatement.run()
      clearAllMessagesStatement.run()
      clearAllTasksStatement.run()
    },

    close(): void {
      db.close()
    },
  }
}
