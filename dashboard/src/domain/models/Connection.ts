// ========================================
// CONNECTION MODELS
// ========================================

export enum OAuthType {
  SALESFORCE_CLASSIC = 'salesforce_classic',
  OAUTH_STANDARD = 'oauth_standard'
}

export interface ConnectionDataJson {
  username: string;
  environment: 'production' | 'sandbox';
  password: string;
  consumerKey?: string;
  consumerSecret?: string;
  securityToken?: string;
  clientId?: string;
  clientSecret?: string;
}

export interface Connection {
  connectionUuid: string;
  displayName: string;
  authProviderId: string;
  encryptedCredentials?: string;
  isConnectionActive: boolean;
  lastUsed: Date;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy?: string;
  version: number;
  isDeleted: boolean;
  deletedAt?: Date;
}

export interface SavedConnection {
  id: string;
  oauthType: OAuthType;
  username: string;
  environment: 'production' | 'sandbox';
  displayName: string;
  lastUsed: number;
  isActive: boolean;
  consumerKey?: string;
  consumerSecret?: string;
  securityToken?: string;
  clientId?: string;
  clientSecret?: string;
}

export interface SavedConnectionWithCredentials extends SavedConnection {
  password: string;
}

export interface CreateConnectionRequest {
  displayName: string;
  authProviderId: string;
  createdBy: string;
}

export interface UpdateConnectionRequest {
  displayName?: string;
  authProviderId?: string;
  isConnectionActive?: boolean;
  updatedBy?: string;
}

export interface ConnectionQuery {
  connectionUuid?: string;
  displayName?: string;
  authProviderId?: string;
  isConnectionActive?: boolean;
  createdBy?: string;
  isDeleted?: boolean;
}
