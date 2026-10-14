import { describe, it, expect } from 'vitest';
import Contact from '../../models/contact.js';
import Resume from '../../models/resume.js';

describe('Mongoose Models Validation', () => {
  describe('Contact Model', () => {
    it('should validate a correct contact object', () => {
      const contact = new Contact({
        name: 'John Doe',
        email: 'john@example.com',
        message: 'Hello world',
      });
      const err = contact.validateSync();
      expect(err).toBeUndefined();
    });

    it('should require name, email and message', () => {
      const err = new Contact({}).validateSync();
      expect(err.errors.name).toBeDefined();
      expect(err.errors.email).toBeDefined();
      expect(err.errors.message).toBeDefined();
    });

    it('should reject oversized fields', () => {
      const err = new Contact({ name: 'a'.repeat(101), email: 'a@b.co', message: 'x'.repeat(5001) }).validateSync();
      expect(err.errors.name).toBeDefined();
      expect(err.errors.message).toBeDefined();
    });

    it('should not cast objects (NoSQL operator payloads) into string fields', () => {
      const err = new Contact({ name: { $ne: null }, email: 'a@b.co', message: 'hi' }).validateSync();
      expect(err.errors.name).toBeDefined();
    });
  });

  describe('Resume Model', () => {
    it('should require filename, data, and contentType', () => {
      const resume = new Resume({});
      const err = resume.validateSync();
      expect(err.errors.filename).toBeDefined();
      expect(err.errors.data).toBeDefined();
      expect(err.errors.contentType).toBeDefined();
    });
  });
});
