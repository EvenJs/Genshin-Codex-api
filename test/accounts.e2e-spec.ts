import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Accounts (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // Helper to generate unique test data
  const uniqueId = () => Date.now().toString(36) + Math.random().toString(36).slice(2);

  // Helper to register and login a user
  async function createUserAndLogin(email: string, password: string) {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password });

    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password });

    return res.body.accessToken;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );

    prisma = app.get(PrismaService);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Authentication', () => {
    it('GET /accounts without token should return 401', async () => {
      const res = await request(app.getHttpServer()).get('/accounts');

      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Unauthorized');
    });

    it('POST /accounts without token should return 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/accounts')
        .send({ uid: '123456789', server: 'asia' });

      expect(res.status).toBe(401);
    });
  });

  describe('Account CRUD', () => {
    it('should create account successfully', async () => {
      const email = `user-${uniqueId()}@test.com`;
      const token = await createUserAndLogin(email, 'password123');
      const uid = `uid-${uniqueId()}`;

      const res = await request(app.getHttpServer())
        .post('/accounts')
        .set('Authorization', `Bearer ${token}`)
        .send({ uid, server: 'asia', nickname: 'TestUser' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        uid,
        server: 'asia',
        nickname: 'TestUser',
      });
      expect(res.body.id).toBeDefined();
    });

    it('should return 409 when creating duplicate uid+server', async () => {
      const email = `user-${uniqueId()}@test.com`;
      const token = await createUserAndLogin(email, 'password123');
      const uid = `uid-${uniqueId()}`;

      // First creation
      await request(app.getHttpServer())
        .post('/accounts')
        .set('Authorization', `Bearer ${token}`)
        .send({ uid, server: 'asia' });

      // Duplicate creation
      const res = await request(app.getHttpServer())
        .post('/accounts')
        .set('Authorization', `Bearer ${token}`)
        .send({ uid, server: 'asia' });

      expect(res.status).toBe(409);
      expect(res.body.message).toContain('already exists');
    });
  });

  describe('Ownership validation', () => {
    it('should return 403 when user B tries to PATCH user A account', async () => {
      // Create User A and account
      const emailA = `userA-${uniqueId()}@test.com`;
      const tokenA = await createUserAndLogin(emailA, 'password123');
      const uid = `uid-${uniqueId()}`;

      const createRes = await request(app.getHttpServer())
        .post('/accounts')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ uid, server: 'asia' });

      const accountId = createRes.body.id;

      // Create User B
      const emailB = `userB-${uniqueId()}@test.com`;
      const tokenB = await createUserAndLogin(emailB, 'password123');

      // User B tries to PATCH User A's account
      const res = await request(app.getHttpServer())
        .patch(`/accounts/${accountId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ nickname: 'Hacked' });

      expect(res.status).toBe(403);
      expect(res.body.message).toBe('You do not own this account');
    });

    it('should return 403 when user B tries to DELETE user A account', async () => {
      // Create User A and account
      const emailA = `userA-${uniqueId()}@test.com`;
      const tokenA = await createUserAndLogin(emailA, 'password123');
      const uid = `uid-${uniqueId()}`;

      const createRes = await request(app.getHttpServer())
        .post('/accounts')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ uid, server: 'europe' });

      const accountId = createRes.body.id;

      // Create User B
      const emailB = `userB-${uniqueId()}@test.com`;
      const tokenB = await createUserAndLogin(emailB, 'password123');

      // User B tries to DELETE User A's account
      const res = await request(app.getHttpServer())
        .delete(`/accounts/${accountId}`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toBe('You do not own this account');
    });

    it('should return 404 when account does not exist', async () => {
      const email = `user-${uniqueId()}@test.com`;
      const token = await createUserAndLogin(email, 'password123');

      const res = await request(app.getHttpServer())
        .patch('/accounts/non-existent-id')
        .set('Authorization', `Bearer ${token}`)
        .send({ nickname: 'Test' });

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('not found');
    });
  });
});
