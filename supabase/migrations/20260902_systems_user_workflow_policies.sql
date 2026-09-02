-- Workflow systèmes MyBasket
-- - un utilisateur peut créer/modifier/supprimer ses systèmes personnels privés
-- - un utilisateur peut proposer ses systèmes au CEO
-- - seuls les CEO peuvent créer/modifier/supprimer un système officiel public validé
-- - le CEO peut lire/modifier les propositions pour les modérer

DROP POLICY IF EXISTS "CEO can read all systems" ON public.systems;
CREATE POLICY "CEO can read all systems"
ON public.systems
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.platform_role = 'ceo'
  )
);

DROP POLICY IF EXISTS "Users can insert their systems" ON public.systems;
DROP POLICY IF EXISTS "Users and CEO can insert systems" ON public.systems;
CREATE POLICY "Users and CEO can insert systems"
ON public.systems
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.platform_role = 'ceo'
  )
  OR (
    auth.uid() = user_id
    AND COALESCE(visibility, 'private') = 'private'
    AND COALESCE(review_status, 'draft') <> 'approved'
  )
);

DROP POLICY IF EXISTS "Users can update their systems" ON public.systems;
DROP POLICY IF EXISTS "Users and CEO can update systems" ON public.systems;
CREATE POLICY "Users and CEO can update systems"
ON public.systems
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.platform_role = 'ceo'
  )
  OR (
    auth.uid() = user_id
    AND NOT (
      COALESCE(visibility, 'private') = 'public'
      AND COALESCE(review_status, 'draft') = 'approved'
    )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.platform_role = 'ceo'
  )
  OR (
    auth.uid() = user_id
    AND COALESCE(visibility, 'private') = 'private'
    AND COALESCE(review_status, 'draft') <> 'approved'
  )
);

DROP POLICY IF EXISTS "Users can delete their systems" ON public.systems;
DROP POLICY IF EXISTS "Users and CEO can delete systems" ON public.systems;
CREATE POLICY "Users and CEO can delete systems"
ON public.systems
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.platform_role = 'ceo'
  )
  OR (
    auth.uid() = user_id
    AND NOT (
      COALESCE(visibility, 'private') = 'public'
      AND COALESCE(review_status, 'draft') = 'approved'
    )
  )
);
