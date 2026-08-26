import { newId, newJoinCode } from '@/core/ids';
import { adoptUngroupedInto, listGroups, saveGroup, setActiveGroupId } from '@/db/repository';
import type { GroupRow } from '@/db/schema';

import { ensureSession } from './session';
import { getSupabase, isSyncConfigured } from './supabase';

/**
 * Creating and joining the group you play with.
 *
 * Both go through database functions rather than plain inserts. That is not a
 * style preference: a policy permissive enough to let someone add themselves
 * to a group would let them add themselves to *any* group. Routing it through
 * `join_group` makes the code the only way in, and the server is what checks
 * it.
 */

export interface GroupSummary {
  readonly id: string;
  readonly name: string;
  readonly joinCode: string;
}

function toSummary(row: GroupRow): GroupSummary {
  return { id: row.id, name: row.name, joinCode: row.joinCode };
}

/**
 * Starts a group and makes it the active one.
 *
 * If this is the first group on the device, everything recorded before it
 * comes along. That history is already this person's, and leaving it stranded
 * outside the group they just made would be the surprising outcome. Joining
 * someone else's group deliberately does not do this.
 */
export async function createGroup(name: string): Promise<GroupSummary> {
  const trimmed = name.trim();
  if (trimmed === '') throw new Error('El grupo necesita un nombre.');

  if (!isSyncConfigured()) {
    throw new Error('Esta versión de la app se compiló sin sincronización.');
  }

  const userId = await ensureSession();
  if (userId === undefined) {
    throw new Error('No hay conexión para crear el grupo. Inténtalo más tarde.');
  }

  const row: GroupRow = {
    id: newId('grp'),
    name: trimmed,
    joinCode: newJoinCode(6),
    createdAt: Date.now(),
    syncedAt: null,
  };

  const { error } = await getSupabase().rpc('create_group', {
    group_id: row.id,
    group_name: row.name,
    code: row.joinCode,
  });
  if (error !== null) throw new Error(`No se pudo crear el grupo: ${error.message}`);

  const isFirst = (await listGroups()).length === 0;

  await saveGroup({ ...row, syncedAt: Date.now() });
  await setActiveGroupId(row.id);
  if (isFirst) await adoptUngroupedInto(row.id);

  return toSummary(row);
}

/** Joins an existing group by its code and makes it active. */
export async function joinGroup(code: string): Promise<GroupSummary> {
  const trimmed = code.trim().toUpperCase();
  if (trimmed === '') throw new Error('Escribe el código del grupo.');

  if (!isSyncConfigured()) {
    throw new Error('Esta versión de la app se compiló sin sincronización.');
  }

  const userId = await ensureSession();
  if (userId === undefined) {
    throw new Error('Hace falta conexión para unirse a un grupo.');
  }

  const supabase = getSupabase();

  const { data: groupId, error } = await supabase.rpc('join_group', { code: trimmed });
  if (error !== null) {
    // The function raises when the code matches nothing; say so in the terms
    // the person typed rather than repeating a database message.
    throw new Error('No existe ningún grupo con ese código.');
  }

  const { data: rows, error: readError } = await supabase
    .from('groups')
    .select('id, name, join_code')
    .eq('id', groupId as string)
    .limit(1);

  if (readError !== null || rows === null || rows.length === 0) {
    throw new Error('Te uniste al grupo, pero no se pudo leer. Prueba a reabrir la app.');
  }

  const remote = rows[0] as { id: string; name: string; join_code: string };
  const row: GroupRow = {
    id: remote.id,
    name: remote.name,
    joinCode: remote.join_code,
    createdAt: Date.now(),
    syncedAt: Date.now(),
  };

  await saveGroup(row);
  await setActiveGroupId(row.id);

  return toSummary(row);
}
