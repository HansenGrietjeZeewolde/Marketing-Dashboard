/* ============================================================
   DashboardRepository - de ENIGE datalaag
   ------------------------------------------------------------
   Alle Supabase-queries lopen via dit object. De rest van de app
   praat nooit rechtstreeks met de database. Schrijfacties falen
   automatisch voor viewers doordat RLS ze weigert; de fouten worden
   hier doorgegeven zodat de UI ze netjes kan tonen.

   Belangrijk over kijktijd:
     - In de database: watch_duration_seconds (seconden).
     - In de app-objecten hieronder: watchDuration (seconden).
     - De UI-formatter zet dit om naar minuten.
   ============================================================ */

import { getSupabase } from './supabase-client.js';

/* ---- Mapping DB <-> app-object ---- */
function postFromDb(r) {
  return {
    id: r.id,
    companyId: r.company_id,
    platform: r.platform,
    date: r.published_date || '',
    time: r.published_time || '',
    text: r.caption || '',
    postType: r.post_type || 'post',
    comments: numOrZero(r.comments),
    engagement: numOrZero(r.engagement),
    follows: numOrZero(r.follows),
    likes: numOrZero(r.likes),
    reach: numOrZero(r.reach),
    saves: numOrZero(r.saves),
    shares: numOrZero(r.shares),
    views: numOrZero(r.views),
    watchDuration: numOrNull(r.watch_duration_seconds),
    dedupKey: r.dedup_key,
    sourceImportId: r.source_import_id || null,
    sourceFileName: r.source_file_name || null
  };
}
function postToDb(companyId, p, importId) {
  return {
    company_id: companyId,
    platform: p.platform,
    published_date: p.date || null,
    published_time: p.time || null,
    caption: p.text || '',
    post_type: p.postType || ((p.watchDuration || 0) > 0 ? 'reel' : 'post'),
    comments: p.comments,
    engagement: p.engagement,
    follows: p.follows,
    likes: p.likes,
    reach: p.reach,
    watch_duration_seconds: p.watchDuration,
    saves: p.saves,
    shares: p.shares,
    views: p.views,
    dedup_key: p.dedupKey,
    source_import_id: importId || null,
    source_file_name: p.sourceFileName || null
  };
}
function followerFromDb(r) {
  return {
    id: r.id,
    companyId: r.company_id,
    month: r.month,
    fbTotal: numOrZero(r.facebook_total),
    fbNew: numOrZero(r.facebook_new),
    igTotal: numOrZero(r.instagram_total),
    igNew: numOrZero(r.instagram_new),
    targetPct: numOrZero(r.target_percentage)
  };
}
function widgetFromDb(r) {
  return {
    id: r.id,
    companyId: r.company_id,
    metric: r.metric,
    platformFilter: r.platform_filter || 'all',
    groupBy: r.group_by || 'platform',
    chartType: r.chart_type || 'bar',
    sortOrder: r.sort_order || 0,
    settings: r.settings || {}
  };
}
function numOrZero(v) {
  return v === null || v === undefined || isNaN(+v) ? 0 : +v;
}
function numOrNull(v) {
  return v === null || v === undefined || v === '' || isNaN(+v) ? null : +v;
}

/* Maakt een willekeurige waarde gegarandeerd JSON-serialiseerbaar voor
   een jsonb-kolom. undefined wordt weggelaten, en niet-eindige getallen
   (Infinity, -Infinity, NaN) worden null. Geeft null als er niets
   overblijft, zodat de insert nooit crasht op ongeldige JSON. */
function toJsonSafe(value) {
  if (value === null || value === undefined) return null;
  try {
    const json = JSON.stringify(value, (k, v) =>
      (typeof v === 'number' && !Number.isFinite(v)) ? null : v
    );
    if (json === undefined) return null;
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}

export const DashboardRepository = {
  /* -------- Vestigingen -------- */
  async getCompanies() {
    const sb = getSupabase();
    const { data, error } = await sb
      .from('companies')
      .select('id,slug,name,accent_color')
      .order('name');
    if (error) throw error;
    return data;
  },

  /* -------- Posts -------- */
  async getPosts(companyId) {
    const sb = getSupabase();
    const { data, error } = await sb
      .from('posts')
      .select('*')
      .eq('company_id', companyId)
      .order('published_date', { ascending: true });
    if (error) throw error;
    return (data || []).map(postFromDb);
  },

  /* createPosts: schrijft een batch nieuwe posts, gekoppeld aan een import.
     Duplicaten (zelfde company_id + dedup_key) worden door de unieke index
     geweigerd; we gebruiken upsert met ignoreDuplicates zodat re-imports
     niet crashen. Geeft de daadwerkelijk ingevoegde rijen terug. */
  async createPosts(companyId, posts, importId) {
    const sb = getSupabase();
    if (!posts.length) return [];
    const payload = posts.map((p) => postToDb(companyId, p, importId));
    const { data, error } = await sb
      .from('posts')
      .upsert(payload, {
        onConflict: 'company_id,dedup_key',
        ignoreDuplicates: true
      })
      .select('*');
    if (error) throw error;
    return (data || []).map(postFromDb);
  },

  /* Vervangende variant: bestaande post met dezelfde sleutel wordt
     bijgewerkt in plaats van overgeslagen. */
  async upsertPostsReplacing(companyId, posts, importId) {
    const sb = getSupabase();
    if (!posts.length) return [];
    const payload = posts.map((p) => postToDb(companyId, p, importId));
    const { data, error } = await sb
      .from('posts')
      .upsert(payload, { onConflict: 'company_id,dedup_key' })
      .select('*');
    if (error) throw error;
    return (data || []).map(postFromDb);
  },

  async updatePost(postId, values) {
    const sb = getSupabase();
    const { data, error } = await sb
      .from('posts')
      .update(values)
      .eq('id', postId)
      .select('*')
      .single();
    if (error) throw error;
    return postFromDb(data);
  },

  async deletePost(postId) {
    const sb = getSupabase();
    const { error } = await sb.from('posts').delete().eq('id', postId);
    if (error) throw error;
  },

  async deletePostsByCompany(companyId) {
    const sb = getSupabase();
    const { error } = await sb.from('posts').delete().eq('company_id', companyId);
    if (error) throw error;
  },

  async existingDedupKeys(companyId) {
    const sb = getSupabase();
    const { data, error } = await sb
      .from('posts')
      .select('dedup_key')
      .eq('company_id', companyId);
    if (error) throw error;
    return new Set((data || []).map((r) => r.dedup_key));
  },

  /* -------- Volgers per maand -------- */
  async getFollowerStats(companyId) {
    const sb = getSupabase();
    const { data, error } = await sb
      .from('follower_stats')
      .select('*')
      .eq('company_id', companyId)
      .order('month', { ascending: true });
    if (error) throw error;
    return (data || []).map(followerFromDb);
  },

  async upsertFollowerStats(companyId, values) {
    const sb = getSupabase();
    const row = {
      company_id: companyId,
      month: values.month,
      facebook_total: values.fbTotal,
      facebook_new: values.fbNew,
      instagram_total: values.igTotal,
      instagram_new: values.igNew,
      target_percentage: values.targetPct
    };
    const { data, error } = await sb
      .from('follower_stats')
      .upsert(row, { onConflict: 'company_id,month' })
      .select('*')
      .single();
    if (error) throw error;
    return followerFromDb(data);
  },

  async deleteFollowerStat(id) {
    const sb = getSupabase();
    const { error } = await sb.from('follower_stats').delete().eq('id', id);
    if (error) throw error;
  },

  async deleteFollowerStatsByCompany(companyId) {
    const sb = getSupabase();
    const { error } = await sb
      .from('follower_stats')
      .delete()
      .eq('company_id', companyId);
    if (error) throw error;
  },

  /* -------- Widgets -------- */
  async getWidgets(companyId) {
    const sb = getSupabase();
    const { data, error } = await sb
      .from('widgets')
      .select('*')
      .eq('company_id', companyId)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data || []).map(widgetFromDb);
  },

  async createWidget(companyId, widget) {
    const sb = getSupabase();
    const row = {
      company_id: companyId,
      metric: widget.metric,
      platform_filter: widget.platformFilter || 'all',
      group_by: widget.groupBy || 'platform',
      chart_type: widget.chartType || 'bar',
      sort_order: widget.sortOrder || 0,
      settings: widget.settings || {}
    };
    const { data, error } = await sb
      .from('widgets')
      .insert(row)
      .select('*')
      .single();
    if (error) throw error;
    return widgetFromDb(data);
  },

  async updateWidget(widgetId, values) {
    const sb = getSupabase();
    const { data, error } = await sb
      .from('widgets')
      .update(values)
      .eq('id', widgetId)
      .select('*')
      .single();
    if (error) throw error;
    return widgetFromDb(data);
  },

  async deleteWidget(widgetId) {
    const sb = getSupabase();
    const { error } = await sb.from('widgets').delete().eq('id', widgetId);
    if (error) throw error;
  },

  /* -------- Imports -------- */
  async getImports(companyId) {
    const sb = getSupabase();
    const { data, error } = await sb
      .from('imports')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async createImport(values) {
    const sb = getSupabase();
    const { data: sess } = await sb.auth.getSession();
    const row = {
      company_id: values.companyId,
      user_id: sess?.session?.user?.id || null,
      file_name: values.fileName || null,
      file_type: values.fileType || null,
      storage_path: values.storagePath || null,
      parser_profile: values.parserProfile || null,
      status: 'pending',
      records_found: values.recordsFound || 0,
      records_valid: values.recordsValid || 0,
      // De kolom 'diagnostics' is van het type jsonb. Sommige diagnose-
      // objecten bevatten waarden die niet rechtstreeks als JSON kunnen
      // worden verzonden (undefined, Infinity/-Infinity of NaN uit de
      // positie-parser), wat leidde tot de fout
      // "invalid input syntax for type json" bij het importeren.
      // We normaliseren daarom naar een gegarandeerd JSON-veilig object.
      diagnostics: toJsonSafe(values.diagnostics)
    };
    const { data, error } = await sb
      .from('imports')
      .insert(row)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  },

  async completeImport(importId, values) {
    const sb = getSupabase();
    const { data, error } = await sb
      .from('imports')
      .update({
        status: 'completed',
        records_imported: values.recordsImported || 0,
        records_skipped: values.recordsSkipped || 0,
        records_replaced: values.recordsReplaced || 0,
        completed_at: new Date().toISOString()
      })
      .eq('id', importId)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  },

  /* Koppel geïmporteerde posts aan een import, zodat we ze later
     veilig kunnen terugdraaien. */
  async linkImportPosts(importId, postIds, action = 'insert') {
    const sb = getSupabase();
    if (!postIds.length) return;
    const rows = postIds.map((pid) => ({
      import_id: importId,
      post_id: pid,
      action
    }));
    const { error } = await sb.from('import_posts').insert(rows);
    if (error) throw error;
  },

  /* revertImport: verwijdert alle posts die bij deze import horen en
     markeert de import als teruggedraaid. */
  async revertImport(importId) {
    const sb = getSupabase();
    const { data: links, error: le } = await sb
      .from('import_posts')
      .select('post_id')
      .eq('import_id', importId)
      .eq('action', 'insert');
    if (le) throw le;
    const ids = (links || []).map((l) => l.post_id).filter(Boolean);
    if (ids.length) {
      const { error: de } = await sb.from('posts').delete().in('id', ids);
      if (de) throw de;
    }
    const { error: ue } = await sb
      .from('imports')
      .update({ status: 'reverted' })
      .eq('id', importId);
    if (ue) throw ue;
    return ids.length;
  }
};    sourceImportId: r.source_import_id || null,
    sourceFileName: r.source_file_name || null
  };
}
function postToDb(companyId, p, importId) {
  return {
    company_id: companyId,
    platform: p.platform,
    published_date: p.date || null,
    published_time: p.time || null,
    caption: p.text || '',
    post_type: p.postType || ((p.watchDuration || 0) > 0 ? 'reel' : 'post'),
    comments: p.comments,
    engagement: p.engagement,
    follows: p.follows,
    likes: p.likes,
    reach: p.reach,
    watch_duration_seconds: p.watchDuration,
    saves: p.saves,
    shares: p.shares,
    views: p.views,
    dedup_key: p.dedupKey,
    source_import_id: importId || null,
    source_file_name: p.sourceFileName || null
  };
}
function followerFromDb(r) {
  return {
    id: r.id,
    companyId: r.company_id,
    month: r.month,
    fbTotal: numOrZero(r.facebook_total),
    fbNew: numOrZero(r.facebook_new),
    igTotal: numOrZero(r.instagram_total),
    igNew: numOrZero(r.instagram_new),
    targetPct: numOrZero(r.target_percentage)
  };
}
function widgetFromDb(r) {
  return {
    id: r.id,
    companyId: r.company_id,
    metric: r.metric,
    platformFilter: r.platform_filter || 'all',
    groupBy: r.group_by || 'platform',
    chartType: r.chart_type || 'bar',
    sortOrder: r.sort_order || 0,
    settings: r.settings || {}
  };
}
function numOrZero(v) {
  return v === null || v === undefined || isNaN(+v) ? 0 : +v;
}
function numOrNull(v) {
  return v === null || v === undefined || v === '' || isNaN(+v) ? null : +v;
}

export const DashboardRepository = {
  /* -------- Vestigingen -------- */
  async getCompanies() {
    const sb = getSupabase();
    const { data, error } = await sb
      .from('companies')
      .select('id,slug,name,accent_color')
      .order('name');
    if (error) throw error;
    return data;
  },

  /* -------- Posts -------- */
  async getPosts(companyId) {
    const sb = getSupabase();
    const { data, error } = await sb
      .from('posts')
      .select('*')
      .eq('company_id', companyId)
      .order('published_date', { ascending: true });
    if (error) throw error;
    return (data || []).map(postFromDb);
  },

  /* createPosts: schrijft een batch nieuwe posts, gekoppeld aan een import.
     Duplicaten (zelfde company_id + dedup_key) worden door de unieke index
     geweigerd; we gebruiken upsert met ignoreDuplicates zodat re-imports
     niet crashen. Geeft de daadwerkelijk ingevoegde rijen terug. */
  async createPosts(companyId, posts, importId) {
    const sb = getSupabase();
    if (!posts.length) return [];
    const payload = posts.map((p) => postToDb(companyId, p, importId));
    const { data, error } = await sb
      .from('posts')
      .upsert(payload, {
        onConflict: 'company_id,dedup_key',
        ignoreDuplicates: true
      })
      .select('*');
    if (error) throw error;
    return (data || []).map(postFromDb);
  },

  /* Vervangende variant: bestaande post met dezelfde sleutel wordt
     bijgewerkt in plaats van overgeslagen. */
  async upsertPostsReplacing(companyId, posts, importId) {
    const sb = getSupabase();
    if (!posts.length) return [];
    const payload = posts.map((p) => postToDb(companyId, p, importId));
    const { data, error } = await sb
      .from('posts')
      .upsert(payload, { onConflict: 'company_id,dedup_key' })
      .select('*');
    if (error) throw error;
    return (data || []).map(postFromDb);
  },

  async updatePost(postId, values) {
    const sb = getSupabase();
    const { data, error } = await sb
      .from('posts')
      .update(values)
      .eq('id', postId)
      .select('*')
      .single();
    if (error) throw error;
    return postFromDb(data);
  },

  async deletePost(postId) {
    const sb = getSupabase();
    const { error } = await sb.from('posts').delete().eq('id', postId);
    if (error) throw error;
  },

  async deletePostsByCompany(companyId) {
    const sb = getSupabase();
    const { error } = await sb.from('posts').delete().eq('company_id', companyId);
    if (error) throw error;
  },

  async existingDedupKeys(companyId) {
    const sb = getSupabase();
    const { data, error } = await sb
      .from('posts')
      .select('dedup_key')
      .eq('company_id', companyId);
    if (error) throw error;
    return new Set((data || []).map((r) => r.dedup_key));
  },

  /* -------- Volgers per maand -------- */
  async getFollowerStats(companyId) {
    const sb = getSupabase();
    const { data, error } = await sb
      .from('follower_stats')
      .select('*')
      .eq('company_id', companyId)
      .order('month', { ascending: true });
    if (error) throw error;
    return (data || []).map(followerFromDb);
  },

  async upsertFollowerStats(companyId, values) {
    const sb = getSupabase();
    const row = {
      company_id: companyId,
      month: values.month,
      facebook_total: values.fbTotal,
      facebook_new: values.fbNew,
      instagram_total: values.igTotal,
      instagram_new: values.igNew,
      target_percentage: values.targetPct
    };
    const { data, error } = await sb
      .from('follower_stats')
      .upsert(row, { onConflict: 'company_id,month' })
      .select('*')
      .single();
    if (error) throw error;
    return followerFromDb(data);
  },

  async deleteFollowerStat(id) {
    const sb = getSupabase();
    const { error } = await sb.from('follower_stats').delete().eq('id', id);
    if (error) throw error;
  },

  async deleteFollowerStatsByCompany(companyId) {
    const sb = getSupabase();
    const { error } = await sb
      .from('follower_stats')
      .delete()
      .eq('company_id', companyId);
    if (error) throw error;
  },

  /* -------- Widgets -------- */
  async getWidgets(companyId) {
    const sb = getSupabase();
    const { data, error } = await sb
      .from('widgets')
      .select('*')
      .eq('company_id', companyId)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data || []).map(widgetFromDb);
  },

  async createWidget(companyId, widget) {
    const sb = getSupabase();
    const row = {
      company_id: companyId,
      metric: widget.metric,
      platform_filter: widget.platformFilter || 'all',
      group_by: widget.groupBy || 'platform',
      chart_type: widget.chartType || 'bar',
      sort_order: widget.sortOrder || 0,
      settings: widget.settings || {}
    };
    const { data, error } = await sb
      .from('widgets')
      .insert(row)
      .select('*')
      .single();
    if (error) throw error;
    return widgetFromDb(data);
  },

  async updateWidget(widgetId, values) {
    const sb = getSupabase();
    const { data, error } = await sb
      .from('widgets')
      .update(values)
      .eq('id', widgetId)
      .select('*')
      .single();
    if (error) throw error;
    return widgetFromDb(data);
  },

  async deleteWidget(widgetId) {
    const sb = getSupabase();
    const { error } = await sb.from('widgets').delete().eq('id', widgetId);
    if (error) throw error;
  },

  /* -------- Imports -------- */
  async getImports(companyId) {
    const sb = getSupabase();
    const { data, error } = await sb
      .from('imports')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async createImport(values) {
    const sb = getSupabase();
    const { data: sess } = await sb.auth.getSession();
    const row = {
      company_id: values.companyId,
      user_id: sess?.session?.user?.id || null,
      file_name: values.fileName || null,
      file_type: values.fileType || null,
      storage_path: values.storagePath || null,
      parser_profile: values.parserProfile || null,
      status: 'pending',
      records_found: values.recordsFound || 0,
      records_valid: values.recordsValid || 0,
      diagnostics: values.diagnostics || null
    };
    const { data, error } = await sb
      .from('imports')
      .insert(row)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  },

  async completeImport(importId, values) {
    const sb = getSupabase();
    const { data, error } = await sb
      .from('imports')
      .update({
        status: 'completed',
        records_imported: values.recordsImported || 0,
        records_skipped: values.recordsSkipped || 0,
        records_replaced: values.recordsReplaced || 0,
        completed_at: new Date().toISOString()
      })
      .eq('id', importId)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  },

  /* Koppel geïmporteerde posts aan een import, zodat we ze later
     veilig kunnen terugdraaien. */
  async linkImportPosts(importId, postIds, action = 'insert') {
    const sb = getSupabase();
    if (!postIds.length) return;
    const rows = postIds.map((pid) => ({
      import_id: importId,
      post_id: pid,
      action
    }));
    const { error } = await sb.from('import_posts').insert(rows);
    if (error) throw error;
  },

  /* revertImport: verwijdert alle posts die bij deze import horen en
     markeert de import als teruggedraaid. */
  async revertImport(importId) {
    const sb = getSupabase();
    const { data: links, error: le } = await sb
      .from('import_posts')
      .select('post_id')
      .eq('import_id', importId)
      .eq('action', 'insert');
    if (le) throw le;
    const ids = (links || []).map((l) => l.post_id).filter(Boolean);
    if (ids.length) {
      const { error: de } = await sb.from('posts').delete().in('id', ids);
      if (de) throw de;
    }
    const { error: ue } = await sb
      .from('imports')
      .update({ status: 'reverted' })
      .eq('id', importId);
    if (ue) throw ue;
    return ids.length;
  }
};
