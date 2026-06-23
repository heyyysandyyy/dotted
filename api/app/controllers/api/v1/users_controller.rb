class Api::V1::UsersController < ApplicationController
  allow_unauthenticated_access only: :create

  def create
    user = User.new(user_params)
    if user.save
      start_new_session_for(user)
      render json: { token: Current.session.token, user: UserSerializer.render_as_hash(user) }, status: :created
    else
      render json: { errors: user.errors.full_messages }, status: :unprocessable_entity
    end
  end

  private

    def user_params
      params.permit(:email_address, :password, :password_confirmation)
    end
end
