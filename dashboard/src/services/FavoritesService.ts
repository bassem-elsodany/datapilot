import { ApiService } from './ApiService';

export interface SObjectFavorite {
  id: string;
  connection_uuid: string;
  sobject_name: string;
  sobject_label?: string;
  is_custom: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateFavoriteRequest {
  sobject_name: string;
  sobject_label?: string;
  is_custom: boolean;
}

export class FavoritesService {
  private apiService: ApiService;

  constructor(apiService: ApiService) {
    this.apiService = apiService;
  }

  async addFavorite(connectionUuid: string, favorite: CreateFavoriteRequest): Promise<SObjectFavorite> {
    const response = await this.apiService.addSObjectFavorite(connectionUuid, favorite);
    return response;
  }

  async getFavorites(connectionUuid: string): Promise<SObjectFavorite[]> {
    const response = await this.apiService.getSObjectFavorites(connectionUuid);
    return response.favorites;
  }

  async deleteFavorite(connectionUuid: string, favoriteId: string): Promise<void> {
    await this.apiService.deleteSObjectFavorite(connectionUuid, favoriteId);
  }

  async isFavorite(connectionUuid: string, sobjectName: string): Promise<boolean> {
    try {
      await this.apiService.checkSObjectFavorite(connectionUuid, sobjectName);
      return true;
    } catch (error) {
      return false;
    }
  }

  async getFavoriteBySObjectName(connectionUuid: string, sobjectName: string): Promise<SObjectFavorite | null> {
    try {
      const response = await this.apiService.checkSObjectFavorite(connectionUuid, sobjectName);
      return response;
    } catch (error) {
      return null;
    }
  }
}
