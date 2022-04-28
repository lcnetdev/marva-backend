const Hangul = require('hangul')





const hangulDict = {
  hangeul: ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ','ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅛ','ㅜ','ㅠ','ㅡ','ㅣ'],
  consonants: ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'],
  vowels: ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅛ','ㅜ','ㅠ','ㅡ','ㅣ'],
  jotiert: ['ㅑ', 'ㅒ', 'ㅖ', 'ㅛ', 'ㅠ', 'ㅕ'],
  // Checks if letter is a Consonant
  isConsonant(letter) {
    return this.consonants.includes(letter);
  },
  // Checks if letter is a Vowel
  isVowel(letter) {
    return this.vowels.includes(letter);
  },
  // Checks if letter is hangeul. if not, it is blank, abc or special character
  notHangeul(letter) {
    return !this.hangeul.includes(letter);
  },
  ㄱ: 'k',
  kiyeokChecker(preprev, prev, fol, fol2) {
    // Check for 'ㄱㅅ' 받침 -> solve in ㅅchecker
    if (
      fol === 'ㅅ' &&
      (hangulDict.consonants.includes(fol2) || this.notHangeul(fol2))
    ) {
      return '';
      // check for 'ㄹㄱ' 받침
    } else if (prev === 'ㄹ' && fol === 'ㅇ') {
      return 'lg';
    } else if (prev === 'ㄹ' && ['ㄱ', 'ㅋ', 'ㄲ'].includes(fol)) {
      return 'l';
    } else if (prev === 'ㄹ' && ['ㄴ', 'ㄹ', 'ㅁ'].includes(fol)) {
      return 'ng';
    } else if (prev === 'ㄹ' && fol === 'ㅎ' && fol2 === 'ㅣ') {
      return "lk'";
    } else if (
      (prev === 'ㄹ' && this.consonants.includes(fol)) ||
      this.notHangeul(fol)
    ) {
      return 'k';
      // Check for 'ㄹㅂ+ㄱ' case
    } else if (preprev === 'ㄹ' && prev === 'ㅂ') {
      return 'g';
      // normal cases
    } else if (prev === 'ㅇ') {
      return 'g';
    } else if (prev === 'ㅎ') {
      return "k'";
    } else if (fol === 'ㄴ' || fol === 'ㄹ' || fol === 'ㅁ') {
      return 'ng';
    } else if (
      (this.isVowel(prev) && (this.isVowel(fol))|| fol ==='ㅇ') ||
      ['ㄴ', 'ㄹ', 'ㅁ'].includes(prev)
    ) {
      return 'g';
    } else {
      return 'k';
    }
  },
  ㄲ: 'kk',
  ssKiyeokChecker(prev, fol) {
    if (prev === 'ㄱ') {
      return 'k';
    } else if (['ㄴ', 'ㄹ', 'ㅁ'].includes(fol)) {
      return 'ng';
    } else if (this.notHangeul(fol) || (this.consonants.includes(fol)&& fol !== 'ㅇ')) {
      return 'k';
    } else {
      return 'kk';
    }
  },
  ㄴ: 'n',
  nieunChecker(preprev, prev, fol, fol2) {
    // Check for 'ㄴㅎ','ㄴㅈ' 받침 -> solve in ㅎ/ㅈ checker
    if (
      (fol === 'ㅎ' || fol === 'ㅈ') &&
      (hangulDict.consonants.includes(fol2) || this.notHangeul(fol2))
    ) {
      return '';
      // check for 'ㄹㅎ + ㄹ' exception
    } else if (preprev === 'ㄹ' && prev === 'ㅎ') {
      return 'l';
    } else if (prev === 'ㄹ' || fol === 'ㄹ') {
      return 'l';
    } else if (fol === 'ㄱ') {
      return "n'";
    } else {
      return 'n';
    }
  },
  ㄷ: 't',
  digeudChecker(preprev, prev, fol, fol2) {
    // ㄹㅌ + ㄷ exception
    if (preprev === 'ㄹ' && prev === 'ㅌ') {
      return 'd';
    } else if (prev === 'ㅎ') {
      return "t'";
    } else if (fol === 'ㅇ' && fol2 === 'ㅣ') {
      return 'j';
    } else if (fol === 'ㅎ' && ['ㅣ', 'ㅕ'].includes(fol2)) {
      return "ch'";
    } else if (
      (this.isVowel(prev) && this.isVowel(fol)) ||
      ['ㄴ', 'ㄹ', 'ㅁ', 'ㅇ'].includes(prev)
    ) {
      return 'd';
    } else if (['ㄴ', 'ㄹ', 'ㅁ'].includes(fol)) {
      return 'n';
    } else if (fol === 'ㅅ') {
      return 's';
    } else {
      return 't';
    }
  },
  ㄸ: 'tt',
  ssDigeudChecker(prev, fol, fol2) {
    if (['ㄷ', 'ㄸ', 'ㅅ', 'ㅆ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅌ'].includes(prev)) {
      return 't';
    } else {
      return 'tt';
    }
  },
  ㄹ: 'r',
  rieulChecker(prev, fol, fol2) {
    //  if (this.jotiert.includes(fol) || fol === 'ㅣ') {
    //   return '';
    // } else
    // Check for 'ㄹㄱ','ㄹㅁ', 'ㄹㅂ', 'ㄹㅅ', 'ㄹㅌ', 'ㄹㅍ', 'ㄹㅎ' 받침 -> solve in respective consonant checkers
    if (
      ['ㄱ', 'ㅁ', 'ㅂ', 'ㅅ', 'ㅌ', 'ㅍ', 'ㅎ'].includes(fol) &&
      (hangulDict.consonants.includes(fol2) || this.notHangeul(fol2))
    ) {
      return '';
    } else if ((this.isVowel(prev) && this.isVowel(fol)) || (fol === 'ㅇ' || fol ==='ㅎ')) {
      return 'r';
    } else if (['ㄴ', 'ㄹ'].includes(prev)) {
      return 'l';
    // prettier-ignore
    } else if (
      ['ㄱ','ㄲ','ㄷ','ㄸ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'].includes(prev)
    ) {
      return 'n';
    } else if (this.notHangeul(prev)) {
      return 'r';
    } else {
      return 'l';
    }
  },
  ㅁ: 'm',
  mieumChecker(prev, fol, fol2) {
    // check for 'ㄹㅁ + vokal' case
    if (prev === 'ㄹ' && fol === 'ㅇ') {
      return 'lm';
    } else {
      return 'm';
    }
  },

  ㅂ: 'p',
  bieubChecker(preprev, prev, fol, fol2) {
    // check for 'ㅂㅅ' 받침
    if (
      fol === 'ㅅ' &&
      (hangulDict.consonants.includes(fol2) || this.notHangeul(fol2))
    ) {
      return '';

      // ㄹㅂ 받침
    } else if (prev === 'ㄹ' && fol === 'ㅇ') {
      return 'lb';
    } else if (prev === 'ㄹ' && fol === 'ㅎ') {
      return "lp'";
    } else if (prev === 'ㄹ' && fol === 'ㄴ') {
      return 'm';
    } else if (
      preprev === 'ㅏ' &&
      prev === 'ㄹ' &&
      ['ㄷ', 'ㄱ'].includes(fol)
    ) {
      return 'p';
    } else if (
      preprev === 'ㅓ' &&
      prev === 'ㄹ' &&
      fol === 'ㄷ' &&
      fol2 === 'ㅜ'
    ) {
      return 'p';
    } else if (
      prev === 'ㄹ' &&
      ['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅍ', 'ㅃ'].includes(fol)
    ) {
      return 'l';
    } else if (prev === 'ㄹ' && this.consonants.includes(fol)) {
      return 'p';
    } else if (prev === 'ㄹ' && this.notHangeul(fol)) {
      return 'l';
      // normal cases
    } else if (
      (this.isVowel(prev) && this.isVowel(fol)) ||
      ['ㄴ', 'ㄹ', 'ㅁ', 'ㅇ'].includes(prev)
    ) {
      return 'b';
    } else if (['ㄴ', 'ㄹ', 'ㅁ'].includes(fol)) {
      return 'm';
    } else return 'p';
  },
  ㅃ: 'pp',
  ssBieubChecker(prev, fol) {
    if (['ㅂ', 'ㅃ', 'ㅍ'].includes(prev)) {
      return 'p';
    } else return 'pp';
  },
  ㅅ: 's',
  siotChecker(prepreprev, preprev, prev, fol, fol2, fol3) {
    // check for 'ㄱㅅ' 받침
    if (prev === 'ㄱ' && fol === 'ㅇ') {
      return 'ks';
    } else if (prev === 'ㄱ' && ['ㄴ', 'ㄹ', 'ㅁ'].includes(fol)) {
      return 'ng';
    } else if (
      prev === 'ㄱ' &&
      (this.consonants.includes(fol) || this.notHangeul(fol))
    ) {
      return 'k';
      // check for 'ㄹㅅ' 받침
    } else if (prev === 'ㄹ' && fol === 'ㅇ') {
      return 'ls';
    } else if (prev === 'ㄹ' && this.consonants.includes(fol)) {
      return 'l';
    } else if (prev === 'ㄹ' && this.notHangeul(fol)) {
      return 'l';
      // check for 'ㅂㅅ' 받침
      // 값어치 exception
    } else if (
      preprev === 'ㅏ' &&
      prev === 'ㅂ' &&
      fol === 'ㅇ' &&
      (fol2 === 'ㅏ' || fol2 === 'ㅓ')
    ) {
      return 'p';
    } else if (prev === 'ㅂ' && fol === 'ㅇ') {
      return 'ps';
    } else if (prev === 'ㅂ' && ['ㄴ', 'ㄹ', 'ㅁ'].includes(fol)) {
      return 'm';
    } else if (
      prev === 'ㅂ' &&
      (this.consonants.includes(fol) || this.notHangeul(fol))
    ) {
      return 'p';
      // check for 읏,윗,첫,헛,풋,갓 Prefixes
      // 웃어른 exception
    } else if (
      preprev === 'ㅇ' &&
      prev === 'ㅜ' &&
      fol === 'ㅇ' &&
      fol2 === 'ㅓ'
    ) {
      return 'd';
      // 윗
    } else if (
      prepreprev === 'ㅇ' &&
      preprev === 'ㅜ' &&
      prev === 'ㅣ' &&
      fol === 'ㅇ' &&
      fol2 !== 'ㅣ'
    ) {
      return 'd';
      // 첫, 헛
    } else if (
      ['ㅊ', 'ㅎ'].includes(preprev) &&
      prev === 'ㅓ' &&
      fol === 'ㅇ' &&
      (!this.jotiert.includes(fol2) || fol2 === 'ㅣ')
    ) {
      return 'd';
      // check for ㅅ이+ cases (나뭇잎, 깻잎,  등)
    } else if (
      fol === 'ㅇ' &&
      (fol2 === 'ㅣ' || this.jotiert.includes(fol2)) &&
      fol3 === 'ㅍ'
    ) {
      return 'nn';
      // 허드렛일 옛이야기exception
    } else if (
      prev === 'ㅔ' && preprev !== 'ㅇ' ||
      (prev === 'ㅖ' && fol === 'ㅇ' && fol2 === 'ㅣ')
    ) {
      return 'nn';
      // normal cases
    } else if (fol === 'ㅜ' && fol2 === 'ㅣ') {
      return 'sh';
    } else if (
      // between vowels
      (this.isVowel(prev) && this.isVowel(fol)) ||
      // prev not hangeul
      this.notHangeul(prev) ||
      // prev is cons
      this.isConsonant(prev)
    ) {
      return 's';
    } else if (
      ['ㄴ', 'ㄹ', 'ㅁ'].includes(fol) ||
      (fol === 'ㅇ' && this.jotiert.includes(fol2))
    ) {
      return 'n';
    } else if (this.isConsonant(fol) && fol !== 'ㅇ') {
      return 't';
    } else if (this.isConsonant(fol)) {
      return 's';
    } else {
      return 't';
    }
  },
  ㅆ: 'ss',
  ssSiotChecker(prev, fol) {
    if (['ㄴ', 'ㄹ', 'ㅁ'].includes(fol)) {
      return 'n';
    } else if (
      this.isConsonant(fol) &&
      !['ㄴ', 'ㄹ', 'ㅁ', 'ㅅ', 'ㅇ'].includes(fol)
    ) {
      return 't';
    } else if (prev === 'ㅅ' || fol === 'ㅅ') {
      return 's';
    } else {
      return 'ss';
    }
  },
  ㅇ: '',
  ieungChecker(prev, fol) {
    if (this.notHangeul(prev) || prev === 'ㅇ') {
      return '';
    } else if (this.isConsonant(prev) && this.isVowel(fol)) {
      return '';
    } else if (this.isVowel(prev) && this.isVowel(fol)) {
      return '';
    } else {
      return 'ng';
    }
  },
  ㅈ: 'ch',
  jieutChecker(prev, fol, fol2) {
    // check for 'ㄴㅈ' 받침
    if (prev === 'ㄴ' && fol === 'ㅇ') {
      return 'nj';
    } else if (prev === 'ㄴ' && fol !== 'ㅎ' && this.consonants.includes(fol)) {
      return 'n';
    } else if (prev === 'ㄴ' && fol === 'ㅎ') {
      return "nch'";
      // normal cases
    } else if (prev === 'ㅎ') {
      return "ch'";
    } else if (fol === 'ㅎ' && ['ㅣ', 'ㅕ'].includes(fol2)) {
      return "ch'";
    } else if (
      (this.isVowel(prev) && this.isVowel(fol)) ||
      (['ㄴ', 'ㄹ', 'ㅁ', 'ㅇ'].includes(prev) || fol === 'ㅇ')
    ) {
      return 'j';
    } else if (['ㄴ', 'ㄹ', 'ㅁ'].includes(fol)) {
      return 'n';
    } else if (
      (this.isConsonant(fol) && fol !== 'ㅅ') ||
      this.notHangeul(fol)
    ) {
      return 't';
    } else if (this.isConsonant(fol)) {
      return 's';
    } else {
      return 'ch';
    }
  },
  ㅉ: 'tch',
  ssJieutChecker(prev, fol) {
    if (['ㄷ', 'ㅅ', 'ㅋ', 'ㅊ', 'ㅌ', 'ㅆ'].includes(prev)) {
      return 'ch';
    } else {
      return 'tch';
    }
  },
  ㅊ: "ch'",
  chieutChecker(prev, fol) {
    if (['ㄴ', 'ㄹ', 'ㅁ'].includes(fol)) {
      return 'n';
    } else if (
      (this.isConsonant(fol) && fol !== 'ㅇ' && fol !== 'ㅅ') ||
      this.notHangeul(fol)
    ) {
      return 't';
    } else if (this.isConsonant(fol)&& fol!== 'ㅇ') {
      return 's';
    } else {
      return "ch'";
    }
  },
  ㅋ: "k'",
  kieukChecker(prev, fol, fol2) {
    if (fol === 'ㄴ' || fol === 'ㄹ' || fol === 'ㅁ') {
      return 'ng';
    } else if (this.isVowel(prev) && this.isVowel(fol)) {
      return "k'";
      // removed '부엌일' edgecase, because it intervened with '부엌이' '부엌이라고'
    // } else if (fol === 'ㅇ' && fol2 === 'ㅣ') {
    //   return 'ngn'; 
    } else if (this.notHangeul(fol)) {
      return 'k';
    } else {
      return "k'";
    }
  },

  ㅌ: "t'",
  tieutChecker(prev, fol, fol2) {
    // check for 'ㄹㅌ' 받침
    if (
      prev === 'ㄹ' &&
      fol === 'ㅇ' &&
      (this.jotiert.includes(fol2) || fol2 === 'ㅣ')
    ) {
      return "lch'";
    } else if (prev === 'ㄹ' && fol === 'ㅇ' && this.vowels.includes(fol2)) {
      return "lt'";
    } else if (prev === 'ㄹ' && this.consonants.includes(fol)) {
      return 'l';

      // normal cases
    } else if (['ㄴ', 'ㄹ', 'ㅁ'].includes(fol)) {
      return 'n';
    } else if (fol === 'ㅇ' && fol2 === 'ㅣ') {
      return "ch'";
    } else if (this.notHangeul(fol) || fol === 'ㅉ' || this.vowels.includes(prev) && this.consonants.includes(fol)) {
      return 't';
    // } else if (fol === 'ㅅ') {
    //   return 's';
    } else {
      return "t'";
    }
  },
  ㅍ: "p'",
  pieupChecker(prev, fol, fol2) {
    // ㄹ,ㅍ 받침 + vokal
    if (prev === 'ㄹ' && fol === 'ㅇ') {
      return "lp'";
    } else if (prev === 'ㄹ' && fol === 'ㄴ') {
      return 'm';
    } else if (prev === 'ㄹ' && this.consonants.includes(fol)) {
      return 'p';
      // ㄹ,ㅍ 받침 + ㄴ
      // normal cases
    } else if (this.notHangeul(fol) || ['ㅂ', 'ㅍ', 'ㅃ'].includes(fol)) {
      return 'p';
       } else if (this.vowels.includes(prev) && (this.consonants.includes(fol)&& fol !== 'ㅇ')) {
      return 'p';
    } else if (['ㄴ', 'ㄹ', 'ㅁ'].includes(fol)) {
      return 'm';
    } else return "p'";
  },
  ㅎ: 'h',
  hieutChecker(preprev, prev, fol, fol2) {
    // check for 'ㄴㅈ+히' exception
    if (preprev === 'ㄴ' && prev === 'ㅈ' && fol === 'ㅣ') {
      return '';
      // check for 'ㄹㄱ+ㅎ' exception
    } else if (preprev === 'ㄹ' && prev === 'ㄱ' && fol === 'ㅣ') {
      return '';
      // check for 'ㄴㅎ' 받침
    } else if (prev === 'ㄴ' && fol === 'ㅇ' && this.vowels.includes(fol2)) {
      return 'n';
    } else if (prev === 'ㄴ' && fol === 'ㅇ') {
      return 'nh';
    } else if (prev === 'ㄴ' && ['ㄱ', 'ㄷ', 'ㅂ', 'ㅈ'].includes(fol)) {
      return 'n';
    } else if (prev === 'ㄴ' && fol === 'ㄴ') {
      return 'n';
    } else if (prev === 'ㄴ' && fol === 'ㅅ') {
      return 'ns';
      // check for 'ㄹㅎ' 받침
    } else if (prev === 'ㄹ' && fol === 'ㅇ' && this.vowels.includes(fol2)) {
      return 'r';
    } else if (prev === 'ㄹ' && fol === 'ㅇ') {
      return 'rh';
    } else if (prev === 'ㄹ' && ['ㄱ', 'ㄷ', 'ㅂ', 'ㅈ'].includes(fol)) {
      return 'l';
    } else if (prev === 'ㄹ' && fol === 'ㄴ') {
      return 'l';
      // normal cases
    } else if (
      this.vowels.includes(prev) &&
      fol === 'ㅇ' &&
      this.vowels.includes(fol2)
    ) {
      return '';
} else if (
      ['ㄷ','ㅈ'].includes(prev) && ['ㅣ','ㅕ'].includes(fol)
    ) {
      return '';


    } else if (fol === 'ㅅ') {
      return 's';
    } else if (this.vowels.includes(prev) && fol === 'ㄴ') {
      return 'n';
    } else if (this.vowels.includes(prev) && this.notHangeul(fol)) {
    return 't';
    } else if (this.notHangeul(fol) || ['ㄱ', 'ㄷ', 'ㅈ'].includes(fol)) {
      return '';
    } else {
      return 'h';
    }
  },
  ㅏ: 'a',
  aChecker(prev, fol, fol2) {
    if (prev === 'ㅗ') {
      return '';
    } else {
      return 'a';
    }
  },
  ㅐ: 'ae',
  aeChecker(prev, fol, fol2) {
    if (prev === 'ㅗ') {
      return '';
    } else {
      return 'ae';
    }
  },
  ㅑ: 'ya',
  ㅒ: 'yae',
  ㅓ: 'ŏ',
  eoChecker(prev, fol, fol2) {
    if (prev === 'ㅜ') {
      return '';
    } else {
      return 'ŏ';
    }
  },
  ㅔ: 'e',
  eChecker(prev, fol, fol2) {
    if (prev === 'ㅜ') {
      return '';
    } else {
      return 'e';
    }
  },
  ㅕ: 'yŏ',
  ㅖ: 'ye',
  ㅗ: 'o',
  oChecker(prev, fol, fol2) {
    if (fol === 'ㅏ') {
      return 'wa';
    } else if (fol === 'ㅐ') {
      return 'wae';
    } else if (fol === 'ㅣ') {
      return 'oe';
    } else {
      return 'o';
    }
  },
  ㅛ: 'yo',
  ㅜ: 'u',
  uChecker(prev, fol, fol2) {
    if (fol === 'ㅓ') {
      return 'wŏ';
    } else if (fol === 'ㅣ') {
      return 'wi';
    } else if (fol === 'ㅔ') {
      return 'we';
    } else {
      return 'u';
    }
  },
  ㅠ: 'yu',
  ㅡ: 'ŭ',
  euChecker(prev, fol, fol2) {
    if (fol === 'ㅣ') {
      return 'ŭi';
    } else {
      return 'ŭ';
    }
  },
  ㅣ: 'i',
  iChecker(prev, fol, fol2) {
    if (['ㅗ', 'ㅜ', 'ㅡ'].includes(prev)) {
      return '';
    } else {
      return 'i';
    }
  },
};

const checker = function (words) {
  const splitText = Hangul.disassemble(words);
  const arr = [];
  for (const [i, letter] of splitText.entries()) {
    //   check for consonants
    if (letter === 'ㄱ') {
      arr.push(
        hangulDict.kiyeokChecker(
          splitText[i - 2],
          splitText[i - 1],
          splitText[i + 1],
          splitText[i + 2]
        )
      );
    } else if (letter === 'ㄴ') {
      arr.push(
        hangulDict.nieunChecker(
          splitText[i - 2],
          splitText[i - 1],
          splitText[i + 1],
          splitText[i + 2]
        )
      );
    } else if (letter === 'ㄷ') {
      arr.push(
        hangulDict.digeudChecker(
          splitText[i - 2],
          splitText[i - 1],
          splitText[i + 1],
          splitText[i + 2]
        )
      );
    } else if (letter === 'ㄹ') {
      arr.push(
        hangulDict.rieulChecker(
          splitText[i - 1],
          splitText[i + 1],
          splitText[i + 2]
        )
      );
    } else if (letter === 'ㅂ') {
      arr.push(
        hangulDict.bieubChecker(
          splitText[i - 2],
          splitText[i - 1],
          splitText[i + 1],
          splitText[i + 2]
        )
      );
    } else if (letter === 'ㅅ') {
      arr.push(
        hangulDict.siotChecker(
          splitText[i - 3],
          splitText[i - 2],
          splitText[i - 1],
          splitText[i + 1],
          splitText[i + 2],
          splitText[i + 3]
        )
      );
    } else if (letter === 'ㅇ') {
      arr.push(hangulDict.ieungChecker(splitText[i - 1], splitText[i + 1]));
    } else if (letter === 'ㅈ') {
      arr.push(
        hangulDict.jieutChecker(
          splitText[i - 1],
          splitText[i + 1],
          splitText[i + 2]
        )
      );
    } else if (letter === 'ㅊ') {
      arr.push(hangulDict.chieutChecker(splitText[i - 1], splitText[i + 1]));
    } else if (letter === 'ㅋ') {
      arr.push(
        hangulDict.kieukChecker(
          splitText[i - 1],
          splitText[i + 1],
          splitText[i + 2]
        )
      );
    } else if (letter === 'ㅌ') {
      arr.push(
        hangulDict.tieutChecker(
          splitText[i - 1],
          splitText[i + 1],
          splitText[i + 2]
        )
      );
    } else if (letter === 'ㅍ') {
      arr.push(
        hangulDict.pieupChecker(
          splitText[i - 1],
          splitText[i + 1],
          splitText[i + 2]
        )
      );
    } else if (letter === 'ㅎ') {
      arr.push(
        hangulDict.hieutChecker(
          splitText[i - 2],
          splitText[i - 1],
          splitText[i + 1],
          splitText[i + 2]
        )
      );
    } else if (letter === 'ㅁ') {
      arr.push(
        hangulDict.mieumChecker(
          splitText[i - 1],
          splitText[i + 1],
          splitText[i + 2]
        )
      );
      // Check for double consonants
    } else if (letter === 'ㄲ') {
      arr.push(
        hangulDict.ssKiyeokChecker(
          splitText[i - 1],
          splitText[i + 1],
          splitText[i + 2]
        )
      );
    } else if (letter === 'ㄸ') {
      arr.push(
        hangulDict.ssDigeudChecker(
          splitText[i - 1],
          splitText[i + 1],
          splitText[i + 2]
        )
      );
    } else if (letter === 'ㅃ') {
      arr.push(
        hangulDict.ssBieubChecker(
          splitText[i - 1],
          splitText[i + 1],
          splitText[i + 2]
        )
      );
    } else if (letter === 'ㅆ') {
      arr.push(
        hangulDict.ssSiotChecker(
          splitText[i - 1],
          splitText[i + 1],
          splitText[i + 2]
        )
      );
    } else if (letter === 'ㅉ') {
      arr.push(
        hangulDict.ssJieutChecker(
          splitText[i - 1],
          splitText[i + 1],
          splitText[i + 2]
        )
      );
      // Check for Diphtongs
    } else if (letter === 'ㅗ') {
      arr.push(
        hangulDict.oChecker(
          splitText[i - 1],
          splitText[i + 1],
          splitText[i + 2]
        )
      );
    } else if (letter === 'ㅜ') {
      arr.push(
        hangulDict.uChecker(
          splitText[i - 1],
          splitText[i + 1],
          splitText[i + 2]
        )
      );
    } else if (letter === 'ㅡ') {
      arr.push(
        hangulDict.euChecker(
          splitText[i - 1],
          splitText[i + 1],
          splitText[i + 2]
        )
      );
    } else if (letter === 'ㅣ') {
      arr.push(
        hangulDict.iChecker(
          splitText[i - 1],
          splitText[i + 1],
          splitText[i + 2]
        )
      );
    } else if (letter === 'ㅓ') {
      arr.push(
        hangulDict.eoChecker(
          splitText[i - 1],
          splitText[i + 1],
          splitText[i + 2]
        )
      );
    } else if (letter === 'ㅏ') {
      arr.push(
        hangulDict.aChecker(
          splitText[i - 1],
          splitText[i + 1],
          splitText[i + 2]
        )
      );
    } else if (letter === 'ㅐ') {
      arr.push(
        hangulDict.aeChecker(
          splitText[i - 1],
          splitText[i + 1],
          splitText[i + 2]
        )
      );
    } else if (letter === 'ㅔ') {
      arr.push(
        hangulDict.eChecker(
          splitText[i - 1],
          splitText[i + 1],
          splitText[i + 2]
        )
      );
    } else {
      hangulDict[letter] ? arr.push(hangulDict[letter]) : arr.push(letter);
    }
  }

  return arr.join('');
};


exports.romanize = function(text){ 

  return checker(text)

}