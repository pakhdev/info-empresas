export class StreetsSearchHelper {
    constructor(private readonly streetsArray: string[]) {}
  
    findStreets(val) {
      return this.streetsArray.filter((value) => {
        return value.includes(val);
      }).length;
    }
  
    excludeWithLetters(letters, returnStreets = false) {
      const filteredArray = this.streetsArray.filter((street) => {
        for (let i = 0; i < letters.length; i++) {
          if (street.includes(letters[i])) {
            return false;
          }
        }
        return true;
      });
  
      return returnStreets
        ? filteredArray
        : filteredArray.length;
    }

    combineLettersAndStreets(letters: string[]): string[] {
      const streets = this.excludeWithLetters(letters, true);
      if (Array.isArray(streets)) return streets.concat(letters);
    }
  
    findBestCombination(baseLetters, bruteLetters): string[] {
      let streetsLefts = 99999;
      let bestLetter = false;
  
      for (const letter of bruteLetters) {
        const resultsLeft = this.excludeWithLetters(baseLetters.concat([letter]));
  
        if (resultsLeft === 0) {
          return baseLetters.concat([letter]);
        } else if (typeof resultsLeft === 'number' && resultsLeft < streetsLefts) {
          bestLetter = letter;
          streetsLefts = resultsLeft;
        }
      }
  
      const newBaseLetters = baseLetters.concat([bestLetter]);
      const newBruteLetters = bruteLetters.filter(
        (bruteLetter) => bruteLetter !== bestLetter
      );

      return newBruteLetters.length
        ? this.findBestCombination(newBaseLetters, newBruteLetters)
        : this.combineLettersAndStreets(baseLetters.concat([bestLetter]));
    }
  
    findValidLetters(acceptPercent:number): { validLetters: string[], frequentLetters: string[] } {
      let validLetters: string[] = [];
      const frequentLetters: string[] = [];
      for (const letter of ['B','D','E','F','G','H','I','J','K','M','N','Ñ','O','Q','S','W','X','Y','Z']) {
        const foundWithLetter:number = this.findStreets(letter);
        const percent:number = Math.round(
          (foundWithLetter / this.streetsArray.length) * 100
        );
        percent < acceptPercent ? validLetters.push(letter) : frequentLetters.push(letter);
      }
      return { validLetters, frequentLetters };
    }
  
    findTwoLetters(validLetters: string[], frequentLetters: string[], acceptPercent:number) {
      const twoLetters: string[] = [];
      const allLetters: string[] = validLetters.concat(frequentLetters);
  
      for (const frequentLetter of frequentLetters) {
        for (const oneLetter of allLetters) {
          const appendBefore = this.findStreets(oneLetter + frequentLetter);
          const percentAppendBefore = Math.round(
            (appendBefore / this.streetsArray.length) * 100
          );
  
          percentAppendBefore < acceptPercent && percentAppendBefore > 2
            ? twoLetters.push(oneLetter + frequentLetter)
            : null;
  
          const appendAfter = this.findStreets(frequentLetter + oneLetter);
          const percentAppendAfter = Math.round(
            (appendAfter / this.streetsArray.length) * 100
          );
  
          percentAppendAfter < acceptPercent && percentAppendAfter > 1
            ? twoLetters.push(frequentLetter + oneLetter)
            : null;
        }
      }
  
      validLetters = validLetters.concat(twoLetters);
      return validLetters;
    }
  
    findBestCombinations(validLetters) {
      const validCombinations = [];
      for (let i = 0; i < validLetters.length; i++) {
        // Exclude streets with main letter
        const mainLetter = validLetters[i];
        const bruteLetter = validLetters.filter(
          (bruteLetter) => bruteLetter !== mainLetter
        );
        // Find best combination
        const combination = this.findBestCombination(
          [mainLetter],
          bruteLetter
        );
  
        return combination;
      }
    }
  }
