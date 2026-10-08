-- Universele productietemplate, versie 1. Referentiedata (ook in productie nodig).
-- Datums: anchor + offset_days. Zonder referentiedatum blijft een taak ongepland.

do $$
declare
  v_template uuid;
  v_version uuid;
begin
  insert into public.templates (name, description, is_default)
  values ('Universele productie', 'Standaardtraject van aanvraag tot evaluatie. Zet niet-relevante taken met een reden op Niet van toepassing.', true)
  returning id into v_template;

  insert into public.template_versions (template_id, version, notes)
  values (v_template, 1, 'Eerste versie') returning id into v_version;

  insert into public.template_tasks
    (template_version_id, phase, sort, title, description, checklist, anchor, offset_days, priority, optional, per_shoot_day, signal_key)
  values
  -- Deal / offerte
  (v_version, 'deal', 10, 'Aanvraag en klantgegevens vastleggen', 'Leg vast wie de klant is, wie het aanspreekpunt is en waar de vraag vandaan komt.',
     '["Klant en contactpersoon vastgelegd","Bron van de aanvraag genoteerd","Gewenste timing genoteerd"]', 'project_start', 0, 'hoog', false, false, null),
  (v_version, 'deal', 20, 'Kennismaking / briefing plannen', 'Plan een kennismaking of briefing met de beslisser en het aanspreekpunt.',
     '["Datum geprikt","Agenda en vragen voorbereid"]', 'project_start', 3, 'normaal', false, false, null),
  (v_version, 'deal', 30, 'Doel, doelgroep, gewenste verandering en deliverables uitvragen', 'Wat moet er na de film anders zijn, bij wie, en welke video''s en formaten zijn nodig?',
     '["Doel","Doelgroep","Gewenste verandering","Deliverables en formaten","Budgetindicatie"]', 'project_start', 5, 'normaal', false, false, null),
  (v_version, 'deal', 40, 'Scope en uitgangspunten bepalen', 'Leg de afgesproken scope vast: aantal video''s, draaidagen, feedbackrondes (standaard 2 per video) en uitgangspunten.',
     '["Aantal video''s en formaten","Aantal draaidagen","Feedbackrondes per video","Wat valt buiten scope"]', 'project_start', 7, 'normaal', false, false, null),
  (v_version, 'deal', 50, 'Pitch of voorstel voorbereiden', 'Alleen als de klant een creatief voorstel of pitch verwacht.',
     '["Richting en referenties","Presentatie klaar"]', 'project_start', 10, 'normaal', true, false, null),
  (v_version, 'deal', 60, 'Offerte opstellen en versturen', 'Offerte in het offerteprogramma. Bedragen en marges horen in het afgeschermde financiële deel, niet in deze taak.',
     '["Offerte opgesteld","Intern gecontroleerd","Verstuurd"]', 'project_start', 10, 'hoog', false, false, null),
  (v_version, 'deal', 70, 'Offerte opvolgen', 'Bel of mail de klant als er nog geen reactie is. Zet de taak op Wacht op klant met een opvolgdatum.',
     '["Opgevolgd","Vragen beantwoord"]', 'project_start', 17, 'normaal', false, false, null),
  (v_version, 'deal', 80, 'Akkoord vastleggen en productie starten', 'Leg het akkoord vast (datum en bron) en kies daarna zelf de volgende fase.',
     '["Akkoord vastgelegd","Planning globaal afgestemd","Fase bijgewerkt"]', 'none', 0, 'hoog', false, false, null),

  -- Strategie & concept
  (v_version, 'strategie', 10, 'Projectdoel en gewenste impact vastleggen', 'Formuleer in één of twee zinnen wat de film moet bereiken. Bij kleine opdrachten volstaat een korte notitie.',
     '["Doel geformuleerd","Gewenste impact meetbaar gemaakt waar mogelijk"]', 'none', 0, 'normaal', false, false, null),
  (v_version, 'strategie', 20, 'Doelgroep en kernboodschap bepalen', 'Voor wie is het en wat moet blijven hangen?',
     '["Doelgroep beschreven","Kernboodschap in één zin"]', 'none', 0, 'normaal', false, false, null),
  (v_version, 'strategie', 30, 'Strategie / creatieve richting uitwerken', 'Kies de aanpak, toon en distributie. Mag licht blijven bij eenvoudige opdrachten.',
     '["Aanpak","Toon en stijl","Kanalen en formaten"]', 'none', 0, 'normaal', false, false, null),
  (v_version, 'strategie', 40, 'Concept en verhaal uitwerken', 'Werk het concept en de verhaallijn uit.',
     '["Concept","Verhaallijn","Referenties"]', 'shoot_day', -28, 'normaal', false, false, null),
  (v_version, 'strategie', 50, 'Concept intern bespreken', 'Kort intern toetsen voordat het naar de klant gaat.',
     '["Feedback verwerkt"]', 'shoot_day', -24, 'normaal', false, false, null),
  (v_version, 'strategie', 60, 'Concept met klant afstemmen en akkoord vastleggen', 'Presenteer het concept en leg het akkoord met datum en bron vast.',
     '["Gepresenteerd","Akkoord vastgelegd"]', 'shoot_day', -21, 'hoog', false, false, null),
  (v_version, 'strategie', 70, 'Bepalen hoe het resultaat wordt geëvalueerd', 'Spreek af hoe en wanneer jullie terugkijken op het resultaat.',
     '["Evaluatiemoment afgesproken","Criteria benoemd"]', 'none', 0, 'laag', false, false, null),

  -- Pre-productie (relatief aan de eerste draaidag)
  (v_version, 'preproductie', 10, 'Kick-off / brainstorm', 'Interne kick-off met het team en waar nodig de klant.',
     '["Team uitgenodigd","Doelen en concept gedeeld"]', 'shoot_day', -21, 'normaal', false, false, null),
  (v_version, 'preproductie', 20, 'Productiedocument en planning opstellen', 'Eén document met planning, rollen, locaties en afspraken.',
     '["Planning","Rollen","Contactlijst"]', 'shoot_day', -14, 'hoog', false, false, null),
  (v_version, 'preproductie', 30, 'Script, shotlist en eventueel storyboard', 'Uitwerken en laten afstemmen waar nodig.',
     '["Script","Shotlist","Storyboard (optioneel)"]', 'shoot_day', -10, 'hoog', false, false, null),
  (v_version, 'preproductie', 40, 'Locaties, casting, styling, props en toestemmingen regelen', 'Alleen wat relevant is; zet de rest op n.v.t. in de checklist-notities.',
     '["Locaties","Casting","Styling","Props","Toestemmingen / quitclaims"]', 'shoot_day', -10, 'normaal', false, false, null),
  (v_version, 'preproductie', 50, 'Muziek en eventuele voice-over bepalen', 'Licenties en stemkeuze vastleggen.',
     '["Muziek gekozen","Licentie geregeld","Voice-over geboekt (indien nodig)"]', 'shoot_day', -7, 'normaal', false, false, null),
  (v_version, 'preproductie', 60, 'Freelancers en crew boeken', 'Boek crew via Productie → Crew. Tarieven horen in het eigenaarsdeel.',
     '["Crew benaderd","Opties genomen","Bevestigd"]', 'shoot_day', -14, 'hoog', false, false, null),
  (v_version, 'preproductie', 70, 'Crewcommunicatie voorbereiden', 'Groepsapp of mail; leg een eventuele groepsapp-link vast bij Documenten en links.',
     '["Kanaal gekozen","Link vastgelegd"]', 'shoot_day', -7, 'laag', false, false, null),
  (v_version, 'preproductie', 80, 'Apparatuur reserveren / huren', 'Reserveer wat niet in eigen bezit is.',
     '["Lijst gemaakt","Gereserveerd"]', 'shoot_day', -7, 'normaal', false, false, null),
  (v_version, 'preproductie', 90, 'Apparatuur ophalen en controleren', 'Batterijen, kaarten, lenzen, audio.',
     '["Opgehaald","Getest","Kaarten leeg en geformatteerd"]', 'shoot_day', -1, 'hoog', false, false, null),
  (v_version, 'preproductie', 100, 'Briefing en callsheet maken en delen', 'Callsheet per draaidag vastleggen bij Productie.',
     '["Callsheet gemaakt","Gedeeld met crew","Gedeeld met klant"]', 'shoot_day', -3, 'hoog', false, false, null),
  (v_version, 'preproductie', 110, 'Definitieve planning en verwachtingen met klant en crew controleren', 'Laatste check op tijden, locatie en verwachtingen.',
     '["Klant akkoord","Crew akkoord"]', 'shoot_day', -2, 'hoog', false, false, null),

  -- Productie (per draaidag)
  (v_version, 'productie', 10, 'Draaidagplanning vastleggen', 'Planning, tijden en locatie van deze draaidag vastleggen bij Productie.',
     '["Tijden","Locatie","Shotvolgorde"]', 'shoot_day', -3, 'hoog', false, true, null),
  (v_version, 'productie', 20, 'Crew- en apparatuurcheck', 'Iedereen aanwezig, alles werkt.',
     '["Crew aanwezig","Apparatuur getest"]', 'shoot_day', 0, 'hoog', false, true, null),
  (v_version, 'productie', 30, 'Opnames uitvoeren', 'Draai volgens shotlist.',
     '["Shotlist afgewerkt","Extra b-roll"]', 'shoot_day', 0, 'hoog', false, true, null),
  (v_version, 'productie', 40, 'Materiaal controleren', 'Steekproef op focus, audio en belichting.',
     '["Beeld gecontroleerd","Audio gecontroleerd"]', 'shoot_day', 0, 'hoog', false, true, null),
  (v_version, 'productie', 50, 'Back-up op SSD en tweede opslag', 'Kopieer naar SSD én een tweede opslag (bijv. HDD).',
     '["SSD","Tweede opslag (HDD)"]', 'shoot_day', 0, 'urgent', false, true, null),
  (v_version, 'productie', 60, 'Back-up gecontroleerd — pas daarna materiaal verwijderen', 'Bevestig dat beide back-ups volledig en leesbaar zijn voordat kaarten worden gewist.',
     '["Bestandsaantallen vergeleken","Steekproef afgespeeld","Kaarten vrijgegeven"]', 'shoot_day', 1, 'urgent', false, true, 'backup_verified'),
  (v_version, 'productie', 70, 'Apparatuur retourneren', 'Indien van toepassing.',
     '["Geretourneerd","Schade gemeld (indien nodig)"]', 'shoot_day', 1, 'normaal', true, true, null),

  -- Post-productie (relatief aan projectdeadline)
  (v_version, 'postproductie', 10, 'Materiaal importeren, organiseren en spotten', 'Structuur in het project, selects markeren.',
     '["Geïmporteerd","Mappenstructuur","Selects"]', 'shoot_day', 2, 'normaal', false, false, null),
  (v_version, 'postproductie', 20, 'Montage per video / deliverable', 'Maak per deliverable een montage.',
     '["Ruwe montage","Fijnmontage"]', 'project_deadline', -21, 'hoog', false, false, null),
  (v_version, 'postproductie', 30, 'Audio, muziek, voice-over, kleur en titels', 'Afwerking.',
     '["Audio mix","Muziek","Voice-over","Kleurcorrectie","Titels en ondertitels"]', 'project_deadline', -14, 'normaal', false, false, null),
  (v_version, 'postproductie', 40, 'Interne kwaliteitscontrole', 'Bekijk elke video kritisch voordat de klant hem ziet.',
     '["Spelling en titels","Audio-niveaus","Exportinstellingen"]', 'project_deadline', -12, 'hoog', false, false, null),
  (v_version, 'postproductie', 50, 'Eerste versie in Vimeo plaatsen en reviewlink vastleggen', 'Leg per video een versie met Vimeo-reviewlink vast bij Deliverables.',
     '["Geüpload","Reviewlink vastgelegd","Klant geïnformeerd"]', 'project_deadline', -12, 'hoog', false, false, null),
  (v_version, 'postproductie', 60, 'Feedbackronde 1 verzamelen en verwerken', 'Feedback blijft in Vimeo; houd de rondestatus per video bij.',
     '["Feedback ontvangen","Verwerkt"]', 'project_deadline', -8, 'hoog', false, false, null),
  (v_version, 'postproductie', 70, 'Nieuwe versie opleveren', 'Nieuwe versie per video met reviewlink.',
     '["Geüpload","Klant geïnformeerd"]', 'project_deadline', -6, 'normaal', false, false, null),
  (v_version, 'postproductie', 80, 'Feedbackronde 2 verzamelen en verwerken', 'Laatste inbegrepen ronde. Extra rondes alleen na geregistreerd meerwerk.',
     '["Feedback ontvangen","Verwerkt"]', 'project_deadline', -3, 'hoog', false, false, null),
  (v_version, 'postproductie', 90, 'Definitief klantakkoord vastleggen', 'Registreer per video het akkoord met datum en bron (Vimeo, e-mail, …).',
     '["Akkoord per video vastgelegd"]', 'project_deadline', -2, 'hoog', false, false, null),
  (v_version, 'postproductie', 100, 'Eindcontrole en exports per afgesproken formaat', 'Exports per formaat (16:9, 9:16, 1:1, …).',
     '["Alle formaten geëxporteerd","Gecontroleerd"]', 'project_deadline', -1, 'hoog', false, false, null),
  (v_version, 'postproductie', 110, 'Klant uitnodigen in de editsuite en stills opleveren', 'Optioneel.',
     '["Sessie gepland","Stills geleverd"]', 'none', 0, 'laag', true, false, null),

  -- Oplevering
  (v_version, 'oplevering', 10, 'Definitieve bestanden en downloadlinks delen', 'Leg de definitieve links per video vast bij Deliverables.',
     '["Links vastgelegd","Gedeeld met klant"]', 'project_deadline', 0, 'hoog', false, false, null),
  (v_version, 'oplevering', 20, 'Controleren of alle video''s, formaten en ondertitels zijn geleverd', 'Vergelijk met de afgesproken scope.',
     '["Video''s","Formaten","Ondertitels"]', 'project_deadline', 0, 'hoog', false, false, null),
  (v_version, 'oplevering', 30, 'Gebruiksafspraken / rechten en overdracht controleren', 'Waar relevant: muzieklicenties, beeldrechten, quitclaims.',
     '["Rechten gecontroleerd","Overdracht vastgelegd"]', 'project_deadline', 2, 'normaal', true, false, null),
  (v_version, 'oplevering', 40, 'Archivering en back-up afhandelen', 'Project archiveren volgens de archiefstructuur.',
     '["Projectbestanden gearchiveerd","Back-up gecontroleerd"]', 'project_deadline', 7, 'normaal', false, false, null),

  -- Afronding & betaling (financiële details in het afgeschermde eigenaarsdeel)
  (v_version, 'afronding', 10, 'Administratieve afronding controleren', 'Alles vastgelegd en afgesloten?',
     '["Documenten compleet","Contacten bijgewerkt"]', 'project_deadline', 7, 'normaal', false, false, null),
  (v_version, 'afronding', 20, 'Freelancerkosten, facturatie en betaling opvolgen', 'Uitvoeren in het afgeschermde financiële deel van de eigenaar. Geen bedragen in deze taak noteren.',
     '["Gecontroleerd in Financiën"]', 'project_deadline', 7, 'hoog', false, false, null),
  (v_version, 'afronding', 30, 'Meerwerk controleren', 'Is er meerwerk geleverd dat nog niet is vastgelegd?',
     '["Gecontroleerd"]', 'project_deadline', 3, 'normaal', false, false, null),
  (v_version, 'afronding', 40, 'Afspraken over betaling opvolgen', 'Controleer in Financiën of alles is betaald.',
     '["Gecontroleerd in Financiën"]', 'project_deadline', 30, 'normaal', false, false, null),

  -- Evaluatie
  (v_version, 'evaluatie', 10, 'Interne debrief', 'Wat ging goed, wat kan beter?',
     '["Debrief gehouden","Leerpunten genoteerd"]', 'project_deadline', 7, 'normaal', false, false, 'evaluation'),
  (v_version, 'evaluatie', 20, 'Klantevaluatie', 'Vraag de klant om terugkoppeling.',
     '["Gesprek of vragenlijst","Terugkoppeling vastgelegd"]', 'project_deadline', 14, 'normaal', false, false, 'evaluation'),
  (v_version, 'evaluatie', 30, 'Resultaten en leerpunten vastleggen', 'Plan zo nodig een latere evaluatiedatum om resultaten te meten.',
     '["Resultaten","Leerpunten","Eventuele latere evaluatiedatum"]', 'project_deadline', 30, 'laag', false, false, null),
  (v_version, 'evaluatie', 40, 'Case, publicatie, BTS of testimonial afstemmen', 'Toestemming vragen voor publicatie.',
     '["Toestemming","Materiaal geselecteerd"]', 'project_deadline', 14, 'laag', true, false, null),
  (v_version, 'evaluatie', 50, 'Mogelijke volgende productie opvolgen', 'Kansen voor een vervolg bespreken.',
     '["Besproken","Opvolgdatum gezet"]', 'project_deadline', 45, 'laag', false, false, null);

  update public.template_versions set published_at = now() where id = v_version;
end $$;
