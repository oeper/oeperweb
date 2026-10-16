"""oneLang language codes (the ones in one-src/onelang/js/langs.js) -> NLLB-200 codes. Codes the loaded model doesn't know are dropped at start-up."""
NLLB = {
  'af':'afr_Latn','sq':'als_Latn','am':'amh_Ethi','ar':'arb_Arab','hy':'hye_Armn','as':'asm_Beng','ay':'ayr_Latn','az':'azj_Latn','bm':'bam_Latn','eu':'eus_Latn',
  'be':'bel_Cyrl','bn':'ben_Beng','bho':'bho_Deva','bs':'bos_Latn','bg':'bul_Cyrl','ca':'cat_Latn','ceb':'ceb_Latn','ny':'nya_Latn','zh-CN':'zho_Hans','zh-TW':'zho_Hant',
  'hr':'hrv_Latn','cs':'ces_Latn','da':'dan_Latn','nl':'nld_Latn','en':'eng_Latn','eo':'epo_Latn','et':'est_Latn','ee':'ewe_Latn','fil':'tgl_Latn','fi':'fin_Latn',
  'fr':'fra_Latn','fy':'fry_Latn','gl':'glg_Latn','ka':'kat_Geor','de':'deu_Latn','el':'ell_Grek','gn':'grn_Latn','gu':'guj_Gujr','ht':'hat_Latn','ha':'hau_Latn',
  'iw':'heb_Hebr','hi':'hin_Deva','hu':'hun_Latn','is':'isl_Latn','ig':'ibo_Latn','ilo':'ilo_Latn','id':'ind_Latn','ga':'gle_Latn','it':'ita_Latn','ja':'jpn_Jpan',
  'jw':'jav_Latn','kn':'kan_Knda','kk':'kaz_Cyrl','km':'khm_Khmr','rw':'kin_Latn','ko':'kor_Hang','ku':'kmr_Latn','ckb':'ckb_Arab','ky':'kir_Cyrl','lo':'lao_Laoo',
  'lv':'lvs_Latn','ln':'lin_Latn','lt':'lit_Latn','lg':'lug_Latn','lb':'ltz_Latn','mk':'mkd_Cyrl','mai':'mai_Deva','mg':'plt_Latn','ms':'zsm_Latn','ml':'mal_Mlym',
  'mt':'mlt_Latn','mi':'mri_Latn','mr':'mar_Deva','mni-Mtei':'mni_Beng','lus':'lus_Latn','mn':'khk_Cyrl','my':'mya_Mymr','ne':'npi_Deva','no':'nob_Latn','or':'ory_Orya',
  'om':'gaz_Latn','ps':'pbt_Arab','fa':'pes_Arab','pl':'pol_Latn','pt':'por_Latn','pa':'pan_Guru','qu':'quy_Latn','ro':'ron_Latn','ru':'rus_Cyrl','sm':'smo_Latn',
  'sa':'san_Deva','gd':'gla_Latn','nso':'nso_Latn','sr':'srp_Cyrl','st':'sot_Latn','sn':'sna_Latn','sd':'snd_Arab','si':'sin_Sinh','sk':'slk_Latn','sl':'slv_Latn',
  'so':'som_Latn','es':'spa_Latn','su':'sun_Latn','sw':'swh_Latn','sv':'swe_Latn','tg':'tgk_Cyrl','ta':'tam_Taml','tt':'tat_Cyrl','te':'tel_Telu','th':'tha_Thai',
  'ti':'tir_Ethi','ts':'tso_Latn','tr':'tur_Latn','tk':'tuk_Latn','ak':'twi_Latn','uk':'ukr_Cyrl','ur':'urd_Arab','ug':'uig_Arab','uz':'uzn_Latn','vi':'vie_Latn',
  'cy':'cym_Latn','xh':'xho_Latn','yi':'ydd_Hebr','yo':'yor_Latn','zu':'zul_Latn',
}
# what langid answers (ISO 639-1) -> oneLang code
FROM_LANGID = {'he':'iw','jv':'jw','tl':'fil','nb':'no','nn':'no','zh':'zh-CN','ms':'ms','mg':'mg'}
NO_SPACE_TARGETS = {'zh-CN', 'zh-TW', 'ja', 'th', 'km', 'lo', 'my'}   # no spaces between sentences
