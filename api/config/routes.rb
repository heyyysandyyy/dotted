Rails.application.routes.draw do
  get "up" => "rails/health#show", as: :rails_health_check

  namespace :api do
    namespace :v1 do
      resource :session, only: %i[show create destroy]
      resource :me, only: :show, controller: :me
      resources :users, only: :create
      resources :passwords, param: :token, only: %i[create update]
    end
  end
end
