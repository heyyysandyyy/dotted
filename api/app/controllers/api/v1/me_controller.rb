class Api::V1::MeController < ApplicationController
  def show
    render json: UserSerializer.render_as_hash(Current.user)
  end
end
