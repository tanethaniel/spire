-- Account deletion: callable from edge function via RPC
CREATE OR REPLACE FUNCTION public.delete_user_data(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verify caller is the target user
  IF auth.uid() IS DISTINCT FROM target_user_id THEN
    RAISE EXCEPTION 'Unauthorized: can only delete own data';
  END IF;

  -- Delete in FK-safe order
  DELETE FROM public.pattern_evidence WHERE pattern_pool_id IN (
    SELECT id FROM public.pattern_pool WHERE user_id = target_user_id
  );
  DELETE FROM public.pattern_pool WHERE user_id = target_user_id;
  DELETE FROM public.pattern_actions WHERE user_id = target_user_id;
  DELETE FROM public.pattern_insights WHERE user_id = target_user_id;
  DELETE FROM public.entry_signals WHERE user_id = target_user_id;
  DELETE FROM public.daily_calendar_signals WHERE user_id = target_user_id;
  DELETE FROM public.journal_entries WHERE user_id = target_user_id;
  DELETE FROM public.user_settings WHERE user_id = target_user_id;
  DELETE FROM public.user_events WHERE user_id = target_user_id;
END;
$$;
