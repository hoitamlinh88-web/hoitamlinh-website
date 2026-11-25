import { supabase } from './supabase-client.js';

const previewGroups = ['Ban Tiếp Tân', 'Đồng tử', 'Ban Thuyết Trình'];

export async function loadGroups(preview) {
  if (preview) return [...previewGroups].sort((a, b) => a.localeCompare(b, 'vi'));
  const { data, error } = await supabase.from('member_groups').select('name').order('name');
  if (error) throw error;
  return (data || []).map(row => row.name).sort((a, b) => a.localeCompare(b, 'vi'));
}

export async function createGroups(names, preview) {
  const clean = [...new Set(names.map(name => String(name || '').trim()).filter(Boolean))];
  if (!clean.length) return;
  if (preview) { clean.forEach(name => { if (!previewGroups.includes(name)) previewGroups.push(name); }); return; }
  const { error } = await supabase.from('member_groups').upsert(clean.map(name => ({ name })), { onConflict: 'name', ignoreDuplicates: true });
  if (error) throw error;
}

export async function deleteGroup(name, preview) {
  if (preview) { previewGroups.splice(previewGroups.indexOf(name), 1); return; }
  const { data: affected, error: readError } = await supabase.from('members').select('id,tags').contains('tags', [name]);
  if (readError) throw readError;
  for (const member of affected || []) {
    const { error } = await supabase.from('members').update({ tags: (member.tags || []).filter(tag => tag !== name) }).eq('id', member.id);
    if (error) throw error;
  }
  const { error } = await supabase.from('member_groups').delete().eq('name', name);
  if (error) throw error;
}

const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));

function summaryText(selected) {
  return selected.length ? selected.join(', ') : 'Chưa có group';
}

/**
 * Renders a dropdown of checkboxes into `container`.
 * `onChange(selectedNames)` fires every time a box is ticked or unticked.
 * Returns { get() } to read the current selection.
 */
export function renderGroupPicker(container, groups, selected = [], onChange = null) {
  let current = selected.filter(name => groups.includes(name));
  const extra = selected.filter(name => !groups.includes(name));
  const options = [...groups, ...extra];
  current = [...current, ...extra];
  container.innerHTML = `<details class="group-picker-dropdown">
    <summary><span class="group-picker-summary ${current.length ? '' : 'is-empty'}">${escapeHtml(summaryText(current))}</span></summary>
    <div class="group-picker-options">${options.length
      ? options.map(name => `<label><input type="checkbox" value="${escapeHtml(name)}" ${current.includes(name) ? 'checked' : ''}> ${escapeHtml(name)}</label>`).join('')
      : '<p class="group-picker-empty">Chưa có group. Tạo group ở mục "Group hội viên".</p>'}</div>
  </details>`;
  const details = container.querySelector('details');
  const summary = container.querySelector('.group-picker-summary');
  container.querySelectorAll('input[type=checkbox]').forEach(input => input.addEventListener('change', () => {
    current = [...container.querySelectorAll('input:checked')].map(box => box.value);
    summary.textContent = summaryText(current);
    summary.classList.toggle('is-empty', !current.length);
    if (onChange) onChange(current);
  }));
  details.addEventListener('toggle', () => {
    if (details.open) document.querySelectorAll('.group-picker-dropdown[open]').forEach(other => { if (other !== details) other.open = false; });
  });
  return { get: () => [...current] };
}

document.addEventListener('click', event => {
  document.querySelectorAll('.group-picker-dropdown[open]').forEach(details => {
    if (!details.contains(event.target)) details.open = false;
  });
});
