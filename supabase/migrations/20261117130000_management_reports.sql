BEGIN;
CREATE OR REPLACE FUNCTION public.management_report_data(date_from date, date_to date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE result jsonb; previous_from date; today date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE id=auth.uid() AND is_active
    AND (role='admin' OR (role='employee' AND permissions ? 'reports.view'))) THEN
    RAISE EXCEPTION 'No tenés permiso para consultar reportes' USING ERRCODE='42501';
  END IF;
  IF date_from IS NULL OR date_to IS NULL OR date_to < date_from OR date_to-date_from > 365 THEN
    RAISE EXCEPTION 'Seleccioná un período válido de hasta 366 días';
  END IF;
  previous_from := date_from - (date_to-date_from+1);
  SELECT jsonb_build_object(
    'today',today,
    'players',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'createdAt',p.created_at,
      'lastBooking',(SELECT max(b.date) FROM public.bookings b JOIN public.booking_players bp ON bp.booking_id=b.id
        WHERE bp.player_id=p.id AND b.status<>'cancelled' AND b.date<=least(date_to,today)))) FROM public.players p),'[]'::jsonb),
    'courts',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'startTime',start_time,'endTime',end_time)) FROM public.courts),'[]'::jsonb),
    'bookings',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id',b.id,'courtId',b.court_id,'courtName',b.court_name,'date',b.date,'startTime',b.start_time,'endTime',b.end_time,
      'status',b.status,'totalPrice',b.total_price,'finalTotal',b.final_total,'isRecurring',b.is_recurring,
      'recurringBookingId',b.recurring_booking_id,'createdAt',b.created_at,
      'players',coalesce((SELECT jsonb_agg(jsonb_build_object('id',player_id,'name',player_name,'isOrganizer',is_organizer,
        'paymentMethod',payment_method,'paymentSplits',payment_splits)) FROM public.booking_players WHERE booking_id=b.id),'[]'::jsonb),
      'consumptions',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'consumableId',consumable_id,'name',name,
        'price',price,'quantity',quantity,'category',category,'splitBetweenPlayers',split_between_players,'assignedToPlayers',assigned_to_players))
        FROM public.booking_consumptions WHERE booking_id=b.id),'[]'::jsonb)))
      FROM public.bookings b WHERE b.date BETWEEN previous_from AND date_to OR b.date BETWEEN today AND today+6),'[]'::jsonb),
    'sales',coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'type',s.type,'date',s.date,'time',s.time,
      'customer',jsonb_build_object('id',s.customer_id,'name',s.customer_name),'totalAmount',s.total_amount,
      'distribution',s.distribution,'paymentMethod',s.payment_method,
      'items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'consumableId',consumable_id,'name',name,
        'price',price,'quantity',quantity,'subtotal',subtotal)) FROM public.sale_items WHERE sale_id=s.id),'[]'::jsonb)))
      FROM public.sales s WHERE s.type='direct' AND s.date BETWEEN previous_from AND date_to),'[]'::jsonb),
    'blocks',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'courtId',court_id,'date',date,'dayOfWeek',day_of_week,
      'startTime',start_time,'endTime',end_time,'isRecurring',is_recurring,'isActive',is_active)) FROM public.court_unavailabilities WHERE is_active),'[]'::jsonb),
    'recurring',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'courtId',court_id,'dayOfWeek',day_of_week,
      'startTime',start_time,'endTime',end_time,'skipDates',skip_dates,'isActive',is_active)) FROM public.recurring_bookings WHERE is_active),'[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.management_report_data(date,date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.management_report_data(date,date) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
