import { User } from './user.entity';

describe('User Entity', () => {
  it('should be defined', () => {
    const user = new User();
    expect(user).toBeDefined();
  });
});
