-- Workflow systèmes MyBasket
-- - un utilisateur garde la main sur ses systèmes personnels
-- - le CEO peut lire/modifier/supprimer les propositions pour les modérer
-- - les systèmes officiels publiés restent détenus par le CEO

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

DROP POLICY IF EXISTS "Users can update their systems" ON public.systems;
DROP POLICY IF EXISTS "Users and CEO can update systems" ON public.systems;
CREATE POLICY "Users and CEO can update systems"
ON public.systems
FOR UPDATE
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.platform_role = 'ceo'
  )
)
WITH CHECK (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.platform_role = 'ceo'
  )
);

DROP POLICY IF EXISTS "Users can delete their systems" ON public.systems;
DROP POLICY IF EXISTS "Users and CEO can delete systems" ON public.systems;
CREATE POLICY "Users and CEO can delete systems"
ON public.systems
FOR DELETE
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.platform_role = 'ceo'
  )
);
