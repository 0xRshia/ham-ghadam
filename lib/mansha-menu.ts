export const MANSHA_MENU_URL = "https://htqhppqn.menzu.ir/menu/view";
export const MANSHA_MAX_QUANTITY = 10;

export type ManshaMenuItem = {
  id: string;
  name: string;
  category: string;
  priceToman: number;
  description?: string;
};

// Public Menzu menu snapshot. The displayed amounts are in thousands of toman.
const sourceMenu = [
  { id: "019f1cd5-1a33-73c9-a929-fe1b38f48388", name: "بشقاب صبحانه منشأ", category: "صبحانه", priceThousandsToman: 1630 },
  { id: "019f1cd5-97ee-769e-8549-097642e193e6", name: "خاچاپوری", category: "صبحانه", priceThousandsToman: 1320 },
  { id: "019f1cd6-2f28-7280-9603-3c4d6adcdbac", name: "بشقاب صبحانه ایرانی", category: "صبحانه", priceThousandsToman: 1130 },
  { id: "019f1cd6-774b-74f8-8097-360fdec82814", name: "پنکیک میوه و کارامل", category: "صبحانه", priceThousandsToman: 770 },
  { id: "019f1cdb-3c15-72e9-9678-033e8d7f23ef", name: "املت ایرانی", category: "صبحانه", priceThousandsToman: 780 },
  { id: "019f1cda-ed7a-7262-b813-7a6f982f27c9", name: "املت ایتالیایی", category: "صبحانه", priceThousandsToman: 860 },
  { id: "019f1cdb-72bf-73ec-a198-f1f92ed3074d", name: "نیمرو بیکن", category: "صبحانه", priceThousandsToman: 930 },
  { id: "01a06136-0ac3-7623-82b0-b3818da7a7d4", name: "ماست میوه ای و گرانولا", category: "صبحانه", priceThousandsToman: 730 },
  { id: "01a06136-0ac3-7623-82b0-b762c5cc41b6", name: "تست کرم شکلات", category: "صبحانه", priceThousandsToman: 730 },
  { id: "01a06136-0ac3-7623-82b0-bafe01555bd3", name: "بشقاب سوسیس آلمانی", category: "صبحانه", priceThousandsToman: 1470 },
  { id: "01a08cd4-a6b2-743b-91a2-5494b30c562b", name: "فرنچ تست", category: "صبحانه", priceThousandsToman: 850 },
  { id: "01a1861d-d276-74d8-bdb3-91eceb8521e3", name: "اگ بندیکت", category: "صبحانه", priceThousandsToman: 1250 },

  { id: "01a00079-bccc-7351-b155-6974510511df", name: "سوپ روز", category: "پیش غذا", priceThousandsToman: 390 },
  { id: "01a00086-a1f9-7530-b30c-85934c142ef3", name: "حمص", category: "پیش غذا", priceThousandsToman: 730 },
  { id: "01a06845-564d-708f-bb1b-db5ecdefdd87", name: "شریمپ تی ان تی", category: "پیش غذا", priceThousandsToman: 1480 },
  { id: "01a06845-564d-708f-bb1b-dc8c472fa1bc", name: "مرغ با سس ترش و شیرین", category: "پیش غذا", priceThousandsToman: 750 },
  { id: "01a00085-fdeb-7445-9796-a4350baada2b", name: "سالاد استیک", category: "پیش غذا", priceThousandsToman: 1230 },
  { id: "01a0874f-522e-75c0-8fdd-585b3b86559f", name: "سالاد منشأ", category: "پیش غذا", priceThousandsToman: 1430 },
  { id: "01a0874f-522e-75c0-8fdd-5d811c336057", name: "سالاد مرغ", category: "پیش غذا", priceThousandsToman: 1230 },
  { id: "01a0ceda-e926-7299-9ca5-36c14ddcbb9e", name: "بوفالو وینگز", category: "پیش غذا", priceThousandsToman: 870 },
  { id: "01a0daa7-8e53-7776-829f-32441f7b8cd6", name: "بادمجان سوخاری با دیپ نخود", category: "پیش غذا", priceThousandsToman: 870 },
  { id: "01a00088-e87b-720e-949f-2584b539698a", name: "میرزاقاسمی با تخم بلدرچین", category: "پیش غذا", priceThousandsToman: 930 },
  { id: "01a18e35-5694-76bf-a146-8a7af133aeec", name: "سالاد فتوش", category: "پیش غذا", priceThousandsToman: 1070 },
  { id: "01a1ef7e-81b8-715f-9bc4-6def4b90a303", name: "سوپ برش", category: "پیش غذا", priceThousandsToman: 570 },

  { id: "01a00079-4f3d-72dd-9f17-2363ae752e8a", name: "قلیه میگو", category: "غذای اصلی", priceThousandsToman: 1730 },
  { id: "01a00084-ece2-72bf-a5c4-81555bcad089", name: "کباب تابه ای", category: "غذای اصلی", priceThousandsToman: 1710 },
  { id: "01a00087-c43a-7106-9e6c-97ae5ccff529", name: "قزل آلا سوخاری با سس چیمی چوری", category: "غذای اصلی", priceThousandsToman: 1870 },
  { id: "01a00085-9798-75dd-bbf5-313a609b3d21", name: "کلم پلو", category: "غذای اصلی", priceThousandsToman: 1610 },
  { id: "01a00087-0007-72b0-bd59-f3a4740eb3d8", name: "استیک مرغ با برنج سرخ شده", category: "غذای اصلی", priceThousandsToman: 1430 },
  { id: "01a00088-6edc-733b-a175-6e2fb79adff9", name: "برگر منشأ", category: "غذای اصلی", priceThousandsToman: 1470 },
  { id: "01a000bb-4297-76fd-a960-c213caa8a100", name: "جوسی برگر", category: "غذای اصلی", priceThousandsToman: 1430 },
  { id: "01a0cedd-3485-7583-b6ce-423c622d9950", name: "برگر چیکن استریپس", category: "غذای اصلی", priceThousandsToman: 970 },
  { id: "01a00b21-d00f-715c-88f9-552a2cbce778", name: "شنیسل مرغ با نیمرو", category: "غذای اصلی", priceThousandsToman: 1630 },
  { id: "01a000ba-a983-73ea-b43f-de39ba842454", name: "فتوچینی با سس مارینارا و میت بال", category: "غذای اصلی", priceThousandsToman: 1370 },
  { id: "01a000b9-19bb-71ce-9c23-4a55a32e705a", name: "پاستا آلفردو", category: "غذای اصلی", priceThousandsToman: 1270 },
  { id: "01a000b8-4283-75dc-baeb-a08e1fca3262", name: "پستو با مرغ", category: "غذای اصلی", priceThousandsToman: 1170 },
  { id: "01a01099-d7ac-7639-9892-4071a738778a", name: "پیتزا بیکن", category: "غذای اصلی", priceThousandsToman: 1370 },
  { id: "01a0109b-7796-7169-94cb-849b3967e3d3", name: "پیتزا پستو بوقلمون", category: "غذای اصلی", priceThousandsToman: 1290 },
  { id: "01a04853-c72b-75fc-ac3f-6ada8fde3030", name: "پیتزا پپرونی", category: "غذای اصلی", priceThousandsToman: 1470 },
  { id: "01a04854-45a1-733c-8160-a92ef795a448", name: "پیتزا سیر و استیک", category: "غذای اصلی", priceThousandsToman: 1530 },
  { id: "01a04854-d08d-705e-afe6-a24eac46368a", name: "پیتزا مارگاریتا", category: "غذای اصلی", priceThousandsToman: 1030 },
  { id: "01a0109c-f7e4-729f-9325-d1d06e02f184", name: "چیکن استراگانف", category: "غذای اصلی", priceThousandsToman: 1330 },
  { id: "01a044bd-6eab-73ff-bfa6-dd267cb8bf97", name: "سبزی پلو با قزل آلای شکم پر", category: "غذای اصلی", priceThousandsToman: 1970 },
  { id: "01a15efe-f4d2-7529-9da6-85995a08bd1a", name: "پیتزا سزار دیلاکس", category: "غذای اصلی", priceThousandsToman: 1290 },
  { id: "01a178e0-173c-769b-8cd8-9c32273a14a7", name: "ساندویچ ناپولی مرغ", category: "غذای اصلی", priceThousandsToman: 1030 },
  { id: "01a1ef80-0479-71f7-9d5e-e67f3d69413e", name: "کوردن بلو", category: "غذای اصلی", priceThousandsToman: 1470 },
  { id: "01a2058f-51a2-70bc-939f-0c2da87fe7c4", name: "لازانیا", category: "غذای اصلی", priceThousandsToman: 1470 },

  { id: "019f1ce0-ce8c-77ff-b134-78569aceca02", name: "اسپرسو (دبل/سینگل)", category: "قهوه", priceThousandsToman: 330 },
  { id: "019f1ce1-7816-761d-b693-7931985abb83", name: "لاته/آیس لاته", category: "قهوه", priceThousandsToman: 430 },
  { id: "019f1ce1-d7c5-75c9-933b-942a7e9dd74e", name: "لاته طعم دار", category: "قهوه", priceThousandsToman: 490 },
  { id: "019f1ce2-2c9a-72b1-907b-690c322d52fe", name: "کاپوچینو", category: "قهوه", priceThousandsToman: 430 },
  { id: "019f1ce2-9ca8-739a-8e6b-018cf4dff387", name: "آمریکانو/آیس آمریکانو", category: "قهوه", priceThousandsToman: 330 },
  { id: "019f1ce3-029a-745b-9e43-b328a5dbaaa9", name: "آفوگاتو", category: "قهوه", priceThousandsToman: 570 },
  { id: "019f4ad3-ad79-710d-8d9a-bfb1aae63a51", name: "قهوه ترک", category: "قهوه", priceThousandsToman: 330 },

  { id: "019f1ce3-4b40-736c-8180-3e49aa9379ea", name: "چای", category: "نوشیدنی گرم", priceThousandsToman: 270 },
  { id: "019f1ce3-8e0f-725b-90d2-c9357f9d3511", name: "چای ماسالا", category: "نوشیدنی گرم", priceThousandsToman: 430 },
  { id: "019f1ce3-f7f4-76c6-8b09-c1cdd9dfa538", name: "هات چاکلت", category: "نوشیدنی گرم", priceThousandsToman: 430 },
  { id: "019f1ce4-2287-73bf-86ed-101e7fdb2e14", name: "وایت چاکلت", category: "نوشیدنی گرم", priceThousandsToman: 430 },
  { id: "019f1ce3-c586-713e-bfd4-eb4cb2739435", name: "دمنوش", category: "نوشیدنی گرم", priceThousandsToman: 370 },
  { id: "01a06bee-4fcd-7683-9afc-5bee7fb04dae", name: "چای باقلوا", category: "نوشیدنی گرم", priceThousandsToman: 370 },
  { id: "01a08687-df6f-737a-bce1-14e0997b20cb", name: "چای و دسر بادام کارامل", category: "نوشیدنی گرم", priceThousandsToman: 370 },

  { id: "019f1ce4-6b8c-77aa-bfd1-f7fb8271963a", name: "شیک پینات", category: "شیک", priceThousandsToman: 670 },
  { id: "019f1ce4-b23d-7359-b3b1-d1a04cc1ac94", name: "شیک چاکلت بری", category: "شیک", priceThousandsToman: 670 },
  { id: "019f1ce5-00be-76f6-be2b-d569696448fe", name: "شیک وانیل", category: "شیک", priceThousandsToman: 670 },
  { id: "019f1ce5-451c-749c-bbf0-9f620cb2c2ee", name: "شیک موکا", category: "شیک", priceThousandsToman: 670 },
  { id: "019f1ce5-7cf8-727b-84e7-59368f175489", name: "شیک قهوه", category: "شیک", priceThousandsToman: 670 },

  { id: "019f1ce5-e9f5-72f2-a37f-c838198f8a2f", name: "یاقوت", category: "ماکتل", priceThousandsToman: 570 },
  { id: "019f1ce6-1f11-7615-a83e-b7b5a0c4e771", name: "دیوان", category: "ماکتل", priceThousandsToman: 570 },
  { id: "019f1ce6-a45f-712a-bb8a-bed94d5120e2", name: "پینک پاین", category: "ماکتل", priceThousandsToman: 570 },

  { id: "019f1ce6-dd50-76d9-8a66-15f9d2c75e0c", name: "خیارسکنجبین", category: "شربت سنتی", priceThousandsToman: 470 },
  { id: "019f1ce7-2d70-741f-9bb6-31b7af7223fb", name: "بهارنارنج زعفران", category: "شربت سنتی", priceThousandsToman: 470 },
  { id: "019f1ce7-71be-70ce-a1c4-220acfb528ad", name: "عرق بیدمشک لیمو", category: "شربت سنتی", priceThousandsToman: 470 },

  { id: "019f1ce8-2c1e-710e-98c5-e8033d9705e2", name: "موهیتو", category: "نوشیدنی سرد", priceThousandsToman: 430 },
  { id: "019f1ce8-8c8a-75ad-9d18-a1527fbbf0ce", name: "لیموناد", category: "نوشیدنی سرد", priceThousandsToman: 430 },
  { id: "019f1ce9-7a0b-7379-94a0-d7932c8fb304", name: "سودا لیمو", category: "نوشیدنی سرد", priceThousandsToman: 170 },
  { id: "019f1ce9-aba6-7692-a44b-218ead2b0a74", name: "آب معدنی", category: "نوشیدنی سرد", priceThousandsToman: 70 },

  { id: "019f1ce6-6690-763d-a917-af2d9417f1ef", name: "اورزو بییر", category: "اورزو", priceThousandsToman: 490 },
  { id: "01a08ba5-29cc-76a0-90a1-bbbdbb517a8d", name: "اورزو انار", category: "اورزو", priceThousandsToman: 510 },
  { id: "01a08ba5-29cc-76a0-90a1-bd514a6779ad", name: "اورزو دبل کلدبرو", category: "اورزو", priceThousandsToman: 530 },

  { id: "01a01fdc-e644-70a4-ad31-802cd831343a", name: "بلک فارست", category: "دسر", priceThousandsToman: 630 },
  { id: "01a01fde-07c4-704a-bbc7-85d4d5edb82c", name: "تارت پسته و زعفران", category: "دسر", priceThousandsToman: 610 },
  { id: "01a01fe0-aa05-76f9-810e-a57f11b6b235", name: "چیزکیک سن سباستین", category: "دسر", priceThousandsToman: 670 },
  { id: "01a01fe1-04ef-774b-b3d2-222209ed28d3", name: "پاریس برست فندق", category: "دسر", priceThousandsToman: 670 },
  { id: "01a178e0-173c-769b-8cd8-a247ce9c4991", name: "کیک کرامبل", category: "دسر", priceThousandsToman: 610 },
  { id: "01a178e0-173c-769b-8cd8-a60f2a28c95b", name: "کیک سه شیر", category: "دسر", priceThousandsToman: 610 },
  { id: "01a1f3f0-33be-7606-a2ad-ff4e8fd0db7f", name: "پای سیب", category: "دسر", priceThousandsToman: 670 },
];

export const MANSHA_MENU: readonly ManshaMenuItem[] = sourceMenu.map(({ priceThousandsToman, ...item }) => ({
  ...item, priceToman: priceThousandsToman * 1000,
}));
