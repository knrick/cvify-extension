export class InputValidation {
  // Email validation (existing)
  static isValidEmail(email) {
    if (!email) return false;
    const emailRegex = /^(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9]))\.){3}(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9])|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])$/i;
    return emailRegex.test(email);
  }

  // Enhanced password validation
  static isValidPassword(password) {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /[0-9]/.test(password);
    
    return password.length >= minLength && 
           hasUpperCase && 
           hasLowerCase && 
           hasNumbers
  }

  static isValidLogin(email, password) {
    return this.isValidEmail(email) && this.isValidPassword(password);
  }

  // Name validation (for CV fields)
  static isValidName(name) {
    if (!name || typeof name !== 'string') return false;
    // Allow letters, spaces, hyphens, and apostrophes
    const nameRegex = /^[a-zA-ZÀ-ÿ\s'-]{2,50}$/;
    return nameRegex.test(name.trim());
  }

  // Phone number validation
  static isValidPhone(phone) {
    if (!phone) return false;
    // Basic international phone format
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    return phoneRegex.test(phone.replace(/[\s()-]/g, ''));
  }

  // URL validation
  static isValidURL(url) {
    if (!url) return false;
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  // Date validation
  static isValidDate(date) {
    if (!date) return false;
    const d = new Date(date);
    return d instanceof Date && !isNaN(d) && d.getFullYear() >= 1900 && d.getFullYear() <= 2100;
  }

  // Text field validation
  static isValidTextField(text, maxLength = 1000) {
    if (!text || typeof text !== 'string') return false;
    // Remove HTML tags and check length
    const sanitized = text.replace(/<[^>]*>/g, '');
    return sanitized.length > 0 && sanitized.length <= maxLength;
  }

  // Skills validation
  static isValidSkill(skill) {
    if (!skill || typeof skill !== 'string') return false;
    // Allow letters, numbers, spaces, and common symbols
    const skillRegex = /^[a-zA-Z0-9\s\-+#.]{2,30}$/;
    return skillRegex.test(skill.trim());
  }

  // Language validation
  static isValidLanguage(language) {
    if (!language || typeof language !== 'string') return false;
    // ISO 639-1 language codes or full language names
    const languageRegex = /^[a-zA-Z\s]{2,50}$/;
    return languageRegex.test(language.trim());
  }

  // CV Section validation
  static isValidSection(section) {
    return {
      title: this.isValidTextField(section.title, 100),
      content: this.isValidTextField(section.content),
      startDate: section.startDate ? this.isValidDate(section.startDate) : true,
      endDate: section.endDate ? this.isValidDate(section.endDate) : true
    };
  }

  // File size validation
  static isValidFileSize(size, maxSizeMB = 5) {
    return size <= maxSizeMB * 1024 * 1024; // Convert MB to bytes
  }

  // Image validation
  static isValidImage(file) {
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    return validTypes.includes(file.type) && this.isValidFileSize(file.size);
  }

  // Verification code validation
  static isValidVerificationCode(code) {
    const codeRegex = /^\d{6}$/;
    return codeRegex.test(code);
  }

  // CV Title validation
  static isValidCVTitle(title) {
    if (!title || typeof title !== 'string') return false;
    return title.trim().length >= 3 && title.trim().length <= 50;
  }

  // Complete CV validation
  static validateCV(cv) {
    const errors = {};

    if (!this.isValidName(cv.name)) {
      errors.name = 'Invalid name format';
    }

    if (cv.email && !this.isValidEmail(cv.email)) {
      errors.email = 'Invalid email format';
    }

    if (cv.phone && !this.isValidPhone(cv.phone)) {
      errors.phone = 'Invalid phone number';
    }

    if (cv.website && !this.isValidURL(cv.website)) {
      errors.website = 'Invalid URL format';
    }

    // Add more CV field validations as needed

    return {
      isValid: Object.keys(errors).length === 0,
      errors
    };
  }
}
