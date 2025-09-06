const { APIError, errorHandler, notFoundHandler } = require('../../../src/middleware/errorHandler');

describe('Error Handler Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      url: '/test',
      method: 'GET'
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    next = jest.fn();
    
    // Mock console.error to avoid noise in tests
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('APIError handling', () => {
    it('should handle APIError correctly', () => {
      const error = new APIError('Test error', 400, 'TEST_ERROR');
      
      errorHandler(error, req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'TEST_ERROR',
          message: 'Test error'
        }
      });
    });
  });

  describe('MulterError handling', () => {
    it('should handle file size limit error', () => {
      const error = new Error('File too large');
      error.name = 'MulterError';
      error.code = 'LIMIT_FILE_SIZE';
      
      errorHandler(error, req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'FILE_UPLOAD_ERROR',
          message: 'File size too large'
        }
      });
    });

    it('should handle file count limit error', () => {
      const error = new Error('Too many files');
      error.name = 'MulterError';
      error.code = 'LIMIT_FILE_COUNT';
      
      errorHandler(error, req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'FILE_UPLOAD_ERROR',
          message: 'Too many files uploaded'
        }
      });
    });
  });

  describe('Network errors', () => {
    it('should handle connection refused errors', () => {
      const error = new Error('Connection refused');
      error.code = 'ECONNREFUSED';
      
      errorHandler(error, req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'External service unavailable'
        }
      });
    });

    it('should handle timeout errors', () => {
      const error = new Error('Timeout');
      error.code = 'ETIMEDOUT';
      
      errorHandler(error, req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(504);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'TIMEOUT',
          message: 'Request timeout'
        }
      });
    });
  });

  describe('Generic errors', () => {
    it('should handle generic errors', () => {
      const error = new Error('Generic error');
      
      errorHandler(error, req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error'
        }
      });
    });
  });

  describe('notFoundHandler', () => {
    it('should handle 404 errors correctly', () => {
      req.method = 'POST';
      req.path = '/api/test';
      
      notFoundHandler(req, res);
      
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Route POST /api/test not found'
        }
      });
    });
  });
});