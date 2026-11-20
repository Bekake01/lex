import { normalizeUz } from './normalize.js';
import { cyrillicToLatinUz } from './transliterate.js';

describe('cyrillicToLatinUz', () => {
  it.each([
    ['Ўзбекистон Республикаси Конституцияси', 'Oʻzbekiston Respublikasi Konstitutsiyasi'],
    ['Фуқаролик кодекси', 'Fuqarolik kodeksi'],
    ['Меҳнат кодекси', 'Mehnat kodeksi'],
    ['Шахсга доир маълумотлар тўғрисида', 'Shaxsga doir maʼlumotlar toʻgʻrisida'],
    ['Истеъмолчиларнинг ҳуқуқларини ҳимоя қилиш тўғрисида', 'Isteʼmolchilarning huquqlarini himoya qilish toʻgʻrisida'],
    ['Мулк ижараси шартномаси', 'Mulk ijarasi shartnomasi'],
    ['шартнома тузилган кундан эътиборан', 'shartnoma tuzilgan kundan eʼtiboran'],
    ['ёзма шаклда тузилади', 'yozma shaklda tuziladi'],
    ['юридик шахс', 'yuridik shaxs'],
    ['Солиқ кодекси ва Оила кодекси', 'Soliq kodeksi va Oila kodeksi'],
  ])('%s', (input, expected) => {
    expect(cyrillicToLatinUz(input)).toBe(expected);
  });

  describe('е', () => {
    it('is ye at word start', () => {
      expect(cyrillicToLatinUz('Ер кодекси')).toBe('Yer kodeksi');
    });
    it('is ye after a vowel', () => {
      expect(cyrillicToLatinUz('поезд')).toBe('poyezd');
    });
    it('is e after a consonant', () => {
      expect(cyrillicToLatinUz('депозит')).toBe('depozit');
    });
    it('is ye after ъ', () => {
      expect(cyrillicToLatinUz('объект')).toBe('obʼyekt');
    });
  });

  describe('ц', () => {
    it('is ts after a vowel', () => {
      expect(cyrillicToLatinUz('милиция')).toBe('militsiya');
    });
    it('is s at word start and after a consonant', () => {
      expect(cyrillicToLatinUz('цех ва акция')).toBe('sex va aksiya');
    });
  });

  it('drops ь', () => {
    expect(cyrillicToLatinUz('альтернатив')).toBe('alternativ');
  });

  describe('case', () => {
    it('writes all-caps headings in all caps', () => {
      expect(cyrillicToLatinUz('ЎЗБЕКИСТОН РЕСПУБЛИКАСИНИНГ ҚОНУНИ')).toBe(
        'OʻZBEKISTON RESPUBLIKASINING QONUNI',
      );
    });
    it('keeps multi-letter digraphs all caps at the end of a caps word', () => {
      expect(cyrillicToLatinUz('ТОШ ЧЕК')).toBe('TOSH CHEK');
    });
    it('capitalizes only the first letter of a digraph in a normal word', () => {
      expect(cyrillicToLatinUz('Шартнома ва Чек')).toBe('Shartnoma va Chek');
    });
  });

  it('passes Latin, digits and punctuation through unchanged', () => {
    expect(cyrillicToLatinUz('535-модда. Ijara (1-қисм)')).toBe('535-modda. Ijara (1-qism)');
  });

  it('agrees with normalizeUz on the same word from both scripts', () => {
    expect(cyrillicToLatinUz('тўғрисида')).toBe(normalizeUz("to'g'risida"));
  });
});
