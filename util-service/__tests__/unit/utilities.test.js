/**
 * Unit tests for utility functions
 * These functions are defined inline in server.js but we can test their logic
 */

describe('Utility Functions', () => {
  // Implement chunk function as defined in server.js
  const chunk = function(arr, chunkSize) {
    if (chunkSize <= 0) throw "Invalid chunk size";
    var R = [];
    for (var i = 0, len = arr.length; i < len; i += chunkSize) {
      R.push(arr.slice(i, i + chunkSize));
    }
    return R;
  };

  // Implement isNumeric function as defined in server.js
  const isNumeric = function(num) {
    return !isNaN(num);
  };

  // Implement getDaysArray function as defined in server.js
  const getDaysArray = function(start, end) {
    for (var arr = [], dt = new Date(start); dt <= end; dt.setDate(dt.getDate() + 1)) {
      arr.push(new Date(dt));
    }
    return arr;
  };

  describe('chunk', () => {
    it('should split array into chunks of specified size', () => {
      const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const result = chunk(arr, 3);

      expect(result).toHaveLength(4);
      expect(result[0]).toEqual([1, 2, 3]);
      expect(result[1]).toEqual([4, 5, 6]);
      expect(result[2]).toEqual([7, 8, 9]);
      expect(result[3]).toEqual([10]);
    });

    it('should handle array smaller than chunk size', () => {
      const arr = [1, 2];
      const result = chunk(arr, 5);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual([1, 2]);
    });

    it('should handle empty array', () => {
      const arr = [];
      const result = chunk(arr, 3);

      expect(result).toHaveLength(0);
      expect(result).toEqual([]);
    });

    it('should handle chunk size of 1', () => {
      const arr = [1, 2, 3];
      const result = chunk(arr, 1);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual([1]);
      expect(result[1]).toEqual([2]);
      expect(result[2]).toEqual([3]);
    });

    it('should throw error for invalid chunk size', () => {
      const arr = [1, 2, 3];

      expect(() => chunk(arr, 0)).toThrow("Invalid chunk size");
      expect(() => chunk(arr, -1)).toThrow("Invalid chunk size");
    });

    it('should handle array with exact multiple of chunk size', () => {
      const arr = [1, 2, 3, 4, 5, 6];
      const result = chunk(arr, 2);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual([1, 2]);
      expect(result[1]).toEqual([3, 4]);
      expect(result[2]).toEqual([5, 6]);
    });
  });

  describe('isNumeric', () => {
    it('should return true for integers', () => {
      expect(isNumeric(42)).toBe(true);
      expect(isNumeric(0)).toBe(true);
      expect(isNumeric(100000)).toBe(true);
    });

    it('should return true for floats', () => {
      expect(isNumeric(3.14)).toBe(true);
      expect(isNumeric(0.001)).toBe(true);
      expect(isNumeric(99.99)).toBe(true);
    });

    it('should return true for negative numbers', () => {
      expect(isNumeric(-1)).toBe(true);
      expect(isNumeric(-3.14)).toBe(true);
      expect(isNumeric(-100)).toBe(true);
    });

    it('should return false for NaN', () => {
      expect(isNumeric(NaN)).toBe(false);
    });

    it('should return true for Infinity (isNaN returns false for Infinity)', () => {
      // Note: This matches the server.js implementation which uses !isNaN
      expect(isNumeric(Infinity)).toBe(true);
      expect(isNumeric(-Infinity)).toBe(true);
    });

    it('should return true for numeric strings (isNaN coerces)', () => {
      // Note: isNaN coerces strings to numbers
      expect(isNumeric('42')).toBe(true);
      expect(isNumeric('3.14')).toBe(true);
    });

    it('should return false for non-numeric strings', () => {
      expect(isNumeric('hello')).toBe(false);
      expect(isNumeric('abc123')).toBe(false);
    });

    it('should return true for null (isNaN(null) is false)', () => {
      // null is coerced to 0
      expect(isNumeric(null)).toBe(true);
    });

    it('should return false for undefined', () => {
      expect(isNumeric(undefined)).toBe(false);
    });
  });

  describe('getDaysArray', () => {
    it('should return array of dates between start and end', () => {
      const start = new Date('2024-01-01');
      const end = new Date('2024-01-05');
      const result = getDaysArray(start, end);

      expect(result).toHaveLength(5);
    });

    it('should include both start and end dates', () => {
      const start = new Date('2024-01-01');
      const end = new Date('2024-01-03');
      const result = getDaysArray(start, end);

      expect(result[0].toISOString().split('T')[0]).toBe('2024-01-01');
      expect(result[result.length - 1].toISOString().split('T')[0]).toBe('2024-01-03');
    });

    it('should handle same start and end date', () => {
      const start = new Date('2024-01-15');
      const end = new Date('2024-01-15');
      const result = getDaysArray(start, end);

      expect(result).toHaveLength(1);
      expect(result[0].toISOString().split('T')[0]).toBe('2024-01-15');
    });

    it('should return dates in chronological order', () => {
      const start = new Date('2024-01-01');
      const end = new Date('2024-01-10');
      const result = getDaysArray(start, end);

      for (let i = 1; i < result.length; i++) {
        expect(result[i].getTime()).toBeGreaterThan(result[i - 1].getTime());
      }
    });

    it('should handle month boundaries correctly', () => {
      const start = new Date('2024-01-30');
      const end = new Date('2024-02-02');
      const result = getDaysArray(start, end);

      expect(result).toHaveLength(4);
      expect(result[0].toISOString().split('T')[0]).toBe('2024-01-30');
      expect(result[1].toISOString().split('T')[0]).toBe('2024-01-31');
      expect(result[2].toISOString().split('T')[0]).toBe('2024-02-01');
      expect(result[3].toISOString().split('T')[0]).toBe('2024-02-02');
    });

    it('should handle year boundaries correctly', () => {
      const start = new Date('2023-12-30');
      const end = new Date('2024-01-02');
      const result = getDaysArray(start, end);

      expect(result).toHaveLength(4);
      expect(result[0].getFullYear()).toBe(2023);
      expect(result[result.length - 1].getFullYear()).toBe(2024);
    });

    it('should return empty array when start is after end', () => {
      const start = new Date('2024-01-10');
      const end = new Date('2024-01-01');
      const result = getDaysArray(start, end);

      expect(result).toHaveLength(0);
    });
  });

  describe('Quarter date range calculation', () => {
    // Quarter lookup as defined in server.js
    const qlookup = {
      'Q1': ['-10-01', '-12-31'],
      'Q2': ['-01-01', '-03-31'],
      'Q3': ['-04-01', '-06-30'],
      'Q4': ['-07-01', '-09-30']
    };

    it('should have correct Q1 dates (fiscal year Oct-Dec)', () => {
      const year = '2024';
      const start_date = year + qlookup['Q1'][0];
      const end_date = year + qlookup['Q1'][1];

      expect(start_date).toBe('2024-10-01');
      expect(end_date).toBe('2024-12-31');
    });

    it('should have correct Q2 dates (fiscal year Jan-Mar)', () => {
      const year = '2024';
      const start_date = year + qlookup['Q2'][0];
      const end_date = year + qlookup['Q2'][1];

      expect(start_date).toBe('2024-01-01');
      expect(end_date).toBe('2024-03-31');
    });

    it('should have correct Q3 dates (fiscal year Apr-Jun)', () => {
      const year = '2024';
      const start_date = year + qlookup['Q3'][0];
      const end_date = year + qlookup['Q3'][1];

      expect(start_date).toBe('2024-04-01');
      expect(end_date).toBe('2024-06-30');
    });

    it('should have correct Q4 dates (fiscal year Jul-Sep)', () => {
      const year = '2024';
      const start_date = year + qlookup['Q4'][0];
      const end_date = year + qlookup['Q4'][1];

      expect(start_date).toBe('2024-07-01');
      expect(end_date).toBe('2024-09-30');
    });
  });
});
